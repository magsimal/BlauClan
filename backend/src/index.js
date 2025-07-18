const express = require('express');
const session = require('express-session');
const SequelizeStore = require('connect-session-sequelize')(session.Store);
const LdapAuth = require('ldapauth-fork');
const crypto = require('crypto');
const {
  sequelize,
  Person,
  Marriage,
  Layout,
  Score,
  Setting,
  Activity,
} = require('./models');
const { Op } = require('sequelize');
const cache = require('./cache');

async function addPoints(username, delta, description) {
  if (!username) return;
  const [row] = await Score.findOrCreate({ where: { username }, defaults: { points: 0 } });
  row.points += delta;
  await row.save();
  if (description) {
    await Activity.create({ username, description, points: delta });
  }
}

const app = express();
app.use(express.json());

// Log Authelia headers on every request for debugging
app.use((req, _res, next) => {
  console.log('Authelia headers:', {
    'Remote-User': req.get('Remote-User'),
    'Remote-Email': req.get('Remote-Email'),
    'Remote-Groups': req.get('Remote-Groups'),
    'Remote-Name': req.get('Remote-Name'),
  });
  next();
});
const sessionStore = new SequelizeStore({
  db: sequelize,
});

const LOGIN_ENABLED = process.env.LOGIN_ENABLED === 'true';
const USE_PROXY_AUTH = process.env.USE_PROXY_AUTH === 'true';
const PROXY_ADMIN_GROUP = process.env.PROXY_ADMIN_GROUP || 'familytree_admin';
const PROXY_USER_GROUP = process.env.PROXY_USER_GROUP || 'familytree_user';

const trustedProxies = process.env.TRUSTED_PROXY_IPS
  ? process.env.TRUSTED_PROXY_IPS.split(',').map((ip) => ip.trim())
  : [];

// Let Express parse X-Forwarded-For only from trusted proxies
app.set('trust proxy', (addr) => trustedProxies.includes(addr));

function getProxyIp(req) {
  // right-most address is the direct connection to this app
  const addr = req.ips.length
    ? req.ips[req.ips.length - 1]
    : req.socket.remoteAddress;
  return addr ? addr.replace(/^::ffff:/, '') : '';
}

function isTrustedProxy(req) {
  const ip = getProxyIp(req);
  return trustedProxies.includes(ip);
}


app.use(
  session({
    secret: process.env.SESSION_SECRET || 'secret',
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
  })
);

if (USE_PROXY_AUTH) {
  app.use((req, res, next) => {
    const remoteUser =
      req.headers['remote-user'] || req.headers['x-remote-user'];

    if (remoteUser && isTrustedProxy(req)) {
      const groupsHeader =
        req.headers['remote-groups'] || req.headers['x-remote-groups'] || '';
      const groups = groupsHeader
        ? groupsHeader.split(',').map((g) => g.trim())
        : [];
      const isAdmin = groups.includes(PROXY_ADMIN_GROUP);
      const isUser = groups.includes(PROXY_USER_GROUP);

      if (isAdmin || isUser) {
        req.user = {
          username: remoteUser,
          groups,
          email:
            req.headers['remote-email'] || req.headers['x-remote-email'] || '',
          authedVia: 'proxy',
        };
        req.session.user = req.user.username;
        req.session.name = null;
        req.session.email = req.user.email || null;
        req.session.avatar = null;
        req.session.isAdmin = isAdmin;
        console.log(
          `Proxy auth successful for ${remoteUser} as ${
            isAdmin ? 'admin' : 'user'
          }`,
        );
      } else {
        req.session.user = 'guest';
        req.session.isAdmin = false;
        console.log(`Proxy auth groups not recognized for ${remoteUser}`);
      }
    } else if (remoteUser) {
      req.session.user = 'guest';
      req.session.isAdmin = false;
      console.log(
        `Proxy auth ignored for ${remoteUser} from untrusted IP ${getProxyIp(req)}`,
      );
    }

    next();
  });
}

let ldap;
if (process.env.LDAP_URL) {
  console.log(`Connecting to LDAP server ${process.env.LDAP_URL}`);
  const userAttr = process.env.LDAP_USER_ATTRIBUTE || 'user_id';
  ldap = new LdapAuth({
    url: process.env.LDAP_URL,
    bindDN: process.env.LDAP_BIND_DN,
    bindCredentials: process.env.LDAP_BIND_PASSWORD,
    searchBase: process.env.LDAP_SEARCH_BASE,
    searchFilter:
      process.env.LDAP_SEARCH_FILTER || `(${userAttr}={{username}})`,
  });
  if (ldap._adminClient) {
    ldap._adminClient.on('connect', () => {
      console.log('LDAP connection established');
    });
  }
}

function requireAuth(req, res, next) {
  if (
    LOGIN_ENABLED &&
    !req.user &&
    (!req.session.user || req.session.user === 'guest')
  ) {
    return res.status(401).json({ error: 'login required' });
  }
  next();
}

function requireAdmin(req, res, next) {
  if (LOGIN_ENABLED && !req.session.isAdmin) {
    return res.status(403).json({ error: 'admin required' });
  }
  next();
}

app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  if (!username) {
    console.log('Login attempt missing username');
    return res.status(400).json({ error: 'username required' });
  }
  console.log(`Login attempt for ${username}`);
  if (username === 'guest') {
    req.session.user = 'guest';
    req.session.name = null;
    req.session.email = null;
    req.session.avatar = null;
    console.log('Guest login successful');
    return res.json({ username: 'guest' });
  }
  if (!ldap) {
    console.log('LDAP not configured for login attempt');
    return res.status(500).json({ error: 'LDAP not configured' });
  }
  const attr = process.env.LDAP_USER_ATTRIBUTE || 'user_id';
  ldap.authenticate(username, password, (err, user) => {
    if (err || !user) {
      console.warn(`Login failed for ${username}: ${err ? err.message : 'Invalid credentials'}`);
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    console.log(`Login successful for ${username}`);
    console.log(
      `LDAP user search returned ${user._groups ? user._groups.length : 0} group matches for ${username}`,
    );
    req.session.user = user[attr] || user.uid || username;
    req.session.name = user.displayName || user.cn || null;
    req.session.email = user.mail || null;
    req.session.avatar = user.thumbnailPhoto || user.jpegPhoto || null;
    req.session.isAdmin = false;
    const adminFilter = process.env.LDAP_ADMIN_FILTER;
    if (adminFilter) {
      const base = process.env.LDAP_SEARCH_BASE;
      const filter = adminFilter.replace(
        '{{username}}',
        user[attr] || user.uid || username,
      );
      ldap._search(base, { filter, scope: 'sub' }, (e, items) => {
        if (!e && items && items.length) {
          req.session.isAdmin = true;
        }
        res.json({ username: req.session.user });
      });
    } else {
      res.json({ username: req.session.user });
    }
  });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => res.sendStatus(204));
});

// Debug endpoint to inspect forwarded headers
app.get('/debug/headers', (req, res) => {
  res.json({
    'Remote-User': req.get('Remote-User'),
    'Remote-Email': req.get('Remote-Email'),
    'Remote-Groups': req.get('Remote-Groups'),
    'Remote-Name': req.get('Remote-Name'),
  });
});

app.get('/api/me', async (req, res) => {
  const username = req.session.user || 'guest';
  let nodeId = req.session.meNodeId || null;
  if (username !== 'guest' && !nodeId) {
    const row = await Setting.findOne({ where: { username } });
    if (row) {
      nodeId = row.meNodeId || null;
      req.session.meNodeId = nodeId;
    }
  }
  res.json({
    username,
    name: req.session.name || null,
    email: req.session.email || null,
    avatar: req.session.avatar || null,
    nodeId,
    admin: !!req.session.isAdmin,
  });
});

app.post('/api/me', requireAuth, async (req, res) => {
  const nodeId = req.body.nodeId || null;
  req.session.meNodeId = nodeId;
  const username = req.session.user || 'guest';
  if (username !== 'guest') {
    const [row] = await Setting.findOrCreate({
      where: { username },
      defaults: { theme: 'light', language: 'EN', meNodeId: nodeId },
    });
    row.meNodeId = nodeId;
    await row.save();
  }
  res.sendStatus(204);
});

app.get('/api/settings', async (req, res) => {
  const username = req.session.user || 'guest';
  if (username === 'guest') {
    return res.json(null);
  }
  const [row] = await Setting.findOrCreate({
    where: { username },
    defaults: { theme: 'light', language: 'EN', meNodeId: null },
  });
  res.json({ theme: row.theme, language: row.language, meNodeId: row.meNodeId });
});

app.post('/api/settings', requireAuth, async (req, res) => {
  const username = req.session.user || 'guest';
  if (username === 'guest') {
    return res.status(401).json({ error: 'Guest user cannot save settings' });
  }
  const [row] = await Setting.findOrCreate({
    where: { username },
    defaults: { theme: 'light', language: 'EN', meNodeId: null },
  });
  if (typeof req.body.theme === 'string') row.theme = req.body.theme;
  if (typeof req.body.language === 'string') row.language = req.body.language;
  if (typeof req.body.meNodeId !== 'undefined') row.meNodeId = req.body.meNodeId;
  await row.save();
  res.sendStatus(204);
});

app.get('/api/people', async (_req, res) => {
  const people = await Person.findAll();
  res.json(people);
});

function normalizeParentIds(data) {
  const updates = { ...data };
  ['fatherId', 'motherId', 'birthApprox', 'deathApprox', 'geonameId'].forEach((field) => {
    if (updates[field] === '') updates[field] = null;
  });
  return updates;
}

const GEONAMES_USER = process.env.GEONAMES_USER;
let geonamesEnabled = true;

const PRIORITY_COUNTRIES = new Set(['DE', 'PL', 'HU']);
const EUROPE_COUNTRIES = new Set([
  'AL','AD','AM','AT','AZ','BY','BE','BA','BG','CH','CY','CZ','DE','DK','EE','ES','FI','FR','GB','GE','GR','HR','HU','IE','IS','IT','LI','LT','LU','LV','MC','MD','ME','MK','MT','NL','NO','PL','PT','RO','RU','SE','SI','SK','SM','TR','UA','VA','XK','RS','FO'
]);
const AMERICAS_COUNTRIES = new Set([
  'US','CA','MX','GT','HN','SV','BZ','CR','PA','NI','CU','HT','DO','JM','BS','BB','TT','GY','SR','VE','CO','EC','PE','BO','CL','AR','PY','UY','BR'
]);

function regionPriority(cc) {
  if (PRIORITY_COUNTRIES.has(cc)) return 1;
  if (EUROPE_COUNTRIES.has(cc)) return 2;
  if (AMERICAS_COUNTRIES.has(cc)) return 3;
  return 4;
}

async function geonamesPostalCode(lat, lng, cc) {
  if (!geonamesEnabled) return null;
  const key = `gnzip:${lat}:${lng}:${cc}`;
  const cached = await cache.get(key);
  if (cached !== null) return cached;
  const url =
    `http://api.geonames.org/findNearbyPostalCodesJSON?lat=${lat}&lng=${lng}` +
    (cc ? `&country=${cc}` : '') +
    `&maxRows=1&username=${GEONAMES_USER}`;
  try {
    console.debug(`GeoNames postal request: ${url}`);
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    if (data.postalCodes && data.postalCodes.length) {
      const code = data.postalCodes[0].postalCode || null;
      await cache.set(key, code, 604800); // one week
      return code;
    }
  } catch (e) {
    console.warn(`GeoNames postal request failed for ${url}: ${e.message}`);
  }
  await cache.set(key, null, 86400);
  return null;
}

async function geonamesSuggest(query, lang = 'en', cc = '') {
  if (!geonamesEnabled) return [];
  const q = query
    .trim()
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\s*-\s*/g, '-')
    .replace(/\s+/g, ' ');
  if (!q) return [];
  const hash = crypto.createHash('sha1').update(q + lang + cc).digest('hex');
  const key = `gn:${hash}`;
  const cached = await cache.get(key);
  if (cached) return cached;
  // The GeoNames API only works over HTTP for free accounts
  const encoded = encodeURIComponent(q).replace(/-/g, '%2D');
  const queryParam =
    q.length < 4
      ? `name_startsWith=${encoded}`
      : `q=${encoded}&fuzzy=0.8`;
  const url = `http://api.geonames.org/searchJSON?${queryParam}`
    + `&maxRows=100&username=${GEONAMES_USER}`
    + `&lang=${lang}`
    + (cc ? `&country=${cc}` : '')
    + '&isNameRequired=true';
  try {
    console.debug(`GeoNames request: ${url}`);
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    let res = Array.isArray(data.geonames) ? data.geonames : [];
    if (!/County|Province|District/i.test(q)) {
      res = res.filter((r) => r.fcode && r.fcode.startsWith('PPL'));
    }
    res.sort((a, b) => {
      const pa = regionPriority(a.countryCode);
      const pb = regionPriority(b.countryCode);
      if (pa !== pb) return pa - pb;
      return b.score - a.score;
    });

    const seen = new Set();
    const unique = res.filter((r) => {
      if (seen.has(r.geonameId)) return false;
      seen.add(r.geonameId);
      return true;
    });

    const final = await Promise.all(
      unique.map(async (r) => ({
        geonameId: r.geonameId,
        name: r.name,
        adminName1: r.adminName1,
        countryCode: r.countryCode,
        lat: r.lat,
        lng: r.lng,
        score: r.score,
        postalCode: await geonamesPostalCode(r.lat, r.lng, r.countryCode),
      })),
    );
    await cache.set(key, final, 86400);
    return final;
  } catch (e) {
    console.warn(`GeoNames request failed for ${url}: ${e.message}`);
    return [];
  }
}

async function verifyGeonames() {
  console.log(`GEONAMES_USER: ${process.env.GEONAMES_USER || '(not set)'}`);
  if (!process.env.GEONAMES_USER) {
    console.log('GeoNames disabled: GEONAMES_USER not set');
    geonamesEnabled = false;
    return;
  }
  try {
    const res = await geonamesSuggest('Berlin', 'en');
    if (res.length) {
      geonamesEnabled = true;
      return;
    }
    console.log('GeoNames disabled: invalid GEONAMES_USER');
  } catch (_e) {
    // network or authentication failed
    try {
      const demo = await fetch('http://api.geonames.org/searchJSON?q=london&maxRows=10&username=demo');
      const data = await demo.json();
      if (demo.ok && Array.isArray(data.geonames) && data.geonames.length) {
        console.log('GeoNames disabled: invalid GEONAMES_USER');
      } else {
        console.log('GeoNames disabled: service unreachable');
      }
    } catch (_err) {
      console.log('GeoNames disabled: service unreachable');
    }
  }
  geonamesEnabled = false;
}

async function verifyLdap() {
  if (!ldap) return;
  const base = process.env.LDAP_SEARCH_BASE;
  if (!base) {
    console.log('LDAP_SEARCH_BASE not set, skipping LDAP check');
    return;
  }
  const options = { filter: '(objectClass=*)', scope: 'sub' };
  await new Promise((resolve) => {
    ldap._search(base, options, (err, items) => {
      if (err) {
        console.warn(`LDAP startup search failed: ${err.message}`);
      } else {
        console.log(`LDAP startup search returned ${items.length} entries`);
      }
      resolve();
    });
  });
}

async function validatePlace(place) {
  if (process.env.VALIDATOR_STRICT !== 'true' || !place) return true;
  const suggestions = await geonamesSuggest(place, 'en');
  if (!suggestions.length) return false;
  return suggestions.some(
    (s) => s.score >= 0.9 && s.name.toLowerCase() === place.toLowerCase(),
  );
}

app.get('/places/suggest', async (req, res) => {
  const { q = '', lang = 'en', cc = '' } = req.query;
  const suggestions = await geonamesSuggest(q, lang, cc);
  res.json(suggestions);
});

app.post('/api/people', requireAuth, async (req, res) => {
  try {
    const payload = normalizeParentIds(req.body);
    if (!(await validatePlace(payload.placeOfBirth))) {
      return res.status(400).json({ error: 'Invalid placeOfBirth' });
    }
    const person = await Person.create(payload);
    await addPoints(
      req.session.user || 'guest',
      5,
      `Created person ${person.id}`,
    );
    res.status(201).json(person);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/people/:id', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
  const person = await Person.findByPk(id);
  if (!person) return res.sendStatus(404);
  res.json(person);
});

app.put('/api/people/:id', requireAuth, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
  const person = await Person.findByPk(id);
  if (!person) return res.sendStatus(404);
  const updates = normalizeParentIds(req.body);
  if (!(await validatePlace(updates.placeOfBirth))) {
    return res.status(400).json({ error: 'Invalid placeOfBirth' });
  }
  const before = person.toJSON();
  await person.update(updates);
  let delta = 0;
  const changed = [];
  for (const [k, val] of Object.entries(updates)) {
    if (val === before[k]) continue;
    if ((before[k] === null || before[k] === '' || typeof before[k] === 'undefined') && val) {
      delta += 2;
    } else {
      delta += 1;
    }
    changed.push(k);
  }
  if (delta)
    await addPoints(
      req.session.user || 'guest',
      delta,
      `Updated person ${id}: ${changed.join(', ')}`,
    );
  res.json(person);
});

app.delete('/api/people/:id', requireAuth, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
  const person = await Person.findByPk(id);
  if (!person) return res.sendStatus(404);
  await person.destroy();
  res.sendStatus(204);
});

// Spouse management
app.get('/api/people/:id/spouses', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
  const marriages = await Marriage.findAll({
    where: {
      [Op.or]: [{ personId: id }, { spouseId: id }],
    },
  });
  const result = [];
  for (const m of marriages) {
    const spouseId = m.personId == id ? m.spouseId : m.personId;
    const spouse = await Person.findByPk(spouseId);
    if (spouse) {
      result.push({
        marriageId: m.id,
        dateOfMarriage: m.dateOfMarriage,
        marriageApprox: m.marriageApprox,
        placeOfMarriage: m.placeOfMarriage,
        spouse,
      });
    }
  }
  res.json(result);
});

app.post('/api/people/:id/spouses', requireAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
    const spouseId = parseInt(req.body.spouseId, 10);
    if (Number.isNaN(spouseId)) {
      return res.status(400).json({ error: 'Invalid spouseId' });
    }
    if (id === spouseId) {
      return res.status(400).json({ error: 'Cannot marry self' });
    }

    const [person, spouse] = await Promise.all([
      Person.findByPk(id),
      Person.findByPk(spouseId),
    ]);
    if (!person || !spouse) {
      return res.status(404).json({ error: 'Person not found' });
    }

    const existing = await Marriage.findOne({
      where: {
        [Op.or]: [
          { personId: id, spouseId },
          { personId: spouseId, spouseId: id },
        ],
      },
    });
    if (existing) {
      return res.status(400).json({ error: 'Marriage already exists' });
    }

    const marriage = await Marriage.create({
      personId: id,
      spouseId,
      dateOfMarriage: req.body.dateOfMarriage,
      marriageApprox: req.body.marriageApprox,
      placeOfMarriage: req.body.placeOfMarriage,
    });
    res.status(201).json(marriage);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/people/:id/spouses/:marriageId', requireAuth, async (req, res) => {
  const marriageId = parseInt(req.params.marriageId, 10);
  if (Number.isNaN(marriageId)) return res.status(400).json({ error: 'Invalid marriageId' });
  const marriage = await Marriage.findByPk(marriageId);
  if (!marriage) return res.sendStatus(404);
  await marriage.destroy();
  res.sendStatus(204);
});

async function buildAncestors(id) {
  const numericId = parseInt(id, 10);
  if (Number.isNaN(numericId)) return null;
  const person = await Person.findByPk(numericId);
  if (!person) return null;
  const node = person.toJSON();
  node.father = null;
  node.mother = null;
  if (person.fatherId) {
    node.father = await buildAncestors(person.fatherId);
  }
  if (person.motherId) {
    node.mother = await buildAncestors(person.motherId);
  }
  return node;
}

async function buildDescendants(id) {
  const numericId = parseInt(id, 10);
  if (Number.isNaN(numericId)) return null;
  const person = await Person.findByPk(numericId);
  if (!person) return null;
  const node = person.toJSON();
  const marriages = await Marriage.findAll({
    where: {
      [Op.or]: [{ personId: id }, { spouseId: id }],
    },
  });
  node.spouseRelationships = [];
  for (const m of marriages) {
    const spouseId = m.personId == id ? m.spouseId : m.personId;
    const spouse = await Person.findByPk(spouseId);
    if (!spouse) continue;
    const children = await Person.findAll({
      where: {
        [Op.or]: [
          { fatherId: id, motherId: spouseId },
          { fatherId: spouseId, motherId: id },
        ],
      },
    });
    const childNodes = [];
    for (const child of children) {
      childNodes.push(await buildDescendants(child.id));
    }
    node.spouseRelationships.push({
      spouse: spouse.toJSON(),
      dateOfMarriage: m.dateOfMarriage,
      marriageApprox: m.marriageApprox,
      placeOfMarriage: m.placeOfMarriage,
      children: childNodes,
    });
  }
  return node;
}

app.get('/api/tree/:id', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
  const { type = 'both' } = req.query;
  const person = await Person.findByPk(id);
  if (!person) return res.sendStatus(404);
  const result = { id: person.id };
  if (type === 'ancestors' || type === 'both') {
    result.ancestors = await buildAncestors(person.id);
  }
  if (type === 'descendants' || type === 'both') {
    result.descendants = await buildDescendants(person.id);
  }
  res.json(result);
});

app.get('/api/export/json', async (req, res) => {
  const { filter } = req.query;
  if (filter) {
    const id = parseInt(filter, 10);
    if (Number.isNaN(id)) return res.status(400).json({ error: 'Invalid filter' });
    const tree = await buildDescendants(id);
    res.json(tree);
  } else {
    const people = await Person.findAll();
    res.json(people);
  }
});

app.get('/api/export/db', async (_req, res) => {
  const [people, marriages, layouts] = await Promise.all([
    Person.findAll(),
    Marriage.findAll(),
    Layout.findAll(),
  ]);
  res.json({ people, marriages, layouts });
});

app.post('/api/import/db', requireAdmin, async (req, res) => {
  try {
    const { people = [], marriages = [], layouts = [] } = req.body;
    await sequelize.transaction(async (t) => {
      await Marriage.destroy({ where: {}, truncate: true, cascade: true, transaction: t });
      await Person.destroy({ where: {}, truncate: true, cascade: true, transaction: t });
      await Layout.destroy({ where: {}, truncate: true, cascade: true, transaction: t });
      if (people.length) await Person.bulkCreate(people, { transaction: t });
      if (marriages.length) await Marriage.bulkCreate(marriages, { transaction: t });
      if (layouts.length) await Layout.bulkCreate(layouts, { transaction: t });
    });
    res.sendStatus(204);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Layout endpoints
app.post('/api/layout', requireAuth, async (req, res) => {
  try {
    const layout = await Layout.create({ data: req.body });
    res.status(201).json(layout);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/layout', async (_req, res) => {
  const layout = await Layout.findOne({ order: [['createdAt', 'DESC']] });
  if (!layout) return res.json(null);
  res.json(layout.data);
});

app.get('/api/score', async (req, res) => {
  const username = req.session.user || 'guest';
  const row = await Score.findOne({ where: { username } });
  res.json({ username, points: row ? row.points : 0 });
});

app.get('/api/scores', async (_req, res) => {
  const scores = await Score.findAll({ order: [['points', 'DESC']] });
  res.json(scores);
});

app.post('/api/score/reset', requireAdmin, async (_req, res) => {
  await Score.update({ points: 0 }, { where: {} });
  res.sendStatus(204);
});

app.get('/api/activity', async (_req, res) => {
  const logs = await Activity.findAll({ order: [['createdAt', 'DESC']] });
  res.json(logs);
});

const PORT = process.env.PORT || 3009;
if (require.main === module) {
  // Use `alter: true` so new fields like `callName` are added automatically
  // to existing databases without dropping data. This keeps the schema in sync
  // when models change during development.
  verifyGeonames()
    .finally(() => verifyLdap())
    .finally(() => {
      sequelize.sync({ alter: true }).then(async () => {
        await sessionStore.sync();
        app.listen(PORT, () => {
          console.log(`Server running on port ${PORT}`);
        });
      });
    });
}

app.sessionStore = sessionStore;
module.exports = app;

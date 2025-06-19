const express = require('express');
const crypto = require('crypto');
const { sequelize, Person, Marriage, Layout } = require('./models');
const { Op } = require('sequelize');
const cache = require('./cache');

const app = express();
app.use(express.json());

app.get('/api/people', async (_req, res) => {
  const people = await Person.findAll();
  res.json(people);
});

function normalizeParentIds(data) {
  const updates = { ...data };
  ['fatherId', 'motherId', 'birthApprox', 'deathApprox'].forEach((field) => {
    if (updates[field] === '') updates[field] = null;
  });
  return updates;
}

const GEONAMES_USER = process.env.GEONAMES_USER;
let geonamesEnabled = true;

async function geonamesSuggest(query, lang = 'en', cc = '') {
  if (!geonamesEnabled) return [];
  const q = query.trim().replace(/\s+/g, ' ');
  if (!q) return [];
  const hash = crypto.createHash('sha1').update(q + lang + cc).digest('hex');
  const key = `gn:${hash}`;
  const cached = await cache.get(key);
  if (cached) return cached;
  // The GeoNames API only works over HTTP for free accounts
  const url = new URL('http://api.geonames.org/searchJSON');
  url.searchParams.set('q', q);
  url.searchParams.set('fuzzy', '0.8');
  url.searchParams.set('maxRows', '10');
  url.searchParams.set('username', GEONAMES_USER);
  url.searchParams.set('lang', lang);
  if (cc) url.searchParams.set('country', cc);
  url.searchParams.set('isNameRequired', 'true');
  try {
    console.debug(`GeoNames request: ${url.toString()}`);
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    let res = Array.isArray(data.geonames) ? data.geonames : [];
    if (!/County|Province|District/i.test(q)) {
      res = res.filter((r) => ['PPL', 'PPLA', 'PPLC'].includes(r.fcode));
    }
    const final = res.slice(0, 5).map((r) => ({
      geonameId: r.geonameId,
      name: r.name,
      adminName1: r.adminName1,
      countryCode: r.countryCode,
      lat: r.lat,
      lng: r.lng,
      score: r.score,
    }));
    await cache.set(key, final, 86400);
    return final;
  } catch (e) {
    console.warn(`GeoNames request failed for ${url.toString()}: ${e.message}`);
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

app.post('/api/people', async (req, res) => {
  try {
    const payload = normalizeParentIds(req.body);
    if (!(await validatePlace(payload.placeOfBirth))) {
      return res.status(400).json({ error: 'Invalid placeOfBirth' });
    }
    const person = await Person.create(payload);
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

app.put('/api/people/:id', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
  const person = await Person.findByPk(id);
  if (!person) return res.sendStatus(404);
  const updates = normalizeParentIds(req.body);
  if (!(await validatePlace(updates.placeOfBirth))) {
    return res.status(400).json({ error: 'Invalid placeOfBirth' });
  }
  await person.update(updates);
  res.json(person);
});

app.delete('/api/people/:id', async (req, res) => {
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

app.post('/api/people/:id/spouses', async (req, res) => {
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

app.delete('/api/people/:id/spouses/:marriageId', async (req, res) => {
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

app.post('/api/import/db', async (req, res) => {
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
app.post('/api/layout', async (req, res) => {
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

const PORT = process.env.PORT || 3009;
if (require.main === module) {

  // Use `alter: true` so new fields like `callName` are added automatically
  // to existing databases without dropping data. This keeps the schema in sync
  // when models change during development.
  verifyGeonames().finally(() => {
    sequelize.sync({ alter: true }).then(() => {
      app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
      });
    });
  });
}

module.exports = app;

const express = require('express');
const LdapAuth = require('ldapauth-fork');
const { Setting, Score, Activity } = require('../models');

const router = express.Router();

const LOGIN_ENABLED = process.env.LOGIN_ENABLED === 'true';
const USE_PROXY_AUTH = process.env.USE_PROXY_AUTH === 'true';
const PROXY_ADMIN_GROUP = process.env.PROXY_ADMIN_GROUP || 'familytree_admin';
const PROXY_USER_GROUP = process.env.PROXY_USER_GROUP || 'familytree_user';

const trustedProxies = process.env.TRUSTED_PROXY_IPS
  ? process.env.TRUSTED_PROXY_IPS.split(',').map((ip) => ip.trim())
  : [];

function getProxyIp(req) {
  const addr = req.ips.length ? req.ips[req.ips.length - 1] : req.socket.remoteAddress;
  return addr ? addr.replace(/^::ffff:/, '') : '';
}

function isTrustedProxy(req) {
  const ip = getProxyIp(req);
  return trustedProxies.includes(ip);
}

let ldap;
if (process.env.LDAP_URL) {
  const userAttr = process.env.LDAP_USER_ATTRIBUTE || 'user_id';
  ldap = new LdapAuth({
    url: process.env.LDAP_URL,
    bindDN: process.env.LDAP_BIND_DN,
    bindCredentials: process.env.LDAP_BIND_PASSWORD,
    searchBase: process.env.LDAP_SEARCH_BASE,
    searchFilter: process.env.LDAP_SEARCH_FILTER || `(${userAttr}={{username}})`,
  });
}

if (USE_PROXY_AUTH) {
  router.use((req, _res, next) => {
    const remoteUser = req.headers['remote-user'] || req.headers['x-remote-user'];
    if (remoteUser && isTrustedProxy(req)) {
      const groupsHeader = req.headers['remote-groups'] || req.headers['x-remote-groups'] || '';
      const groups = groupsHeader ? groupsHeader.split(',').map((g) => g.trim()) : [];
      const isAdmin = groups.includes(PROXY_ADMIN_GROUP);
      const isUser = groups.includes(PROXY_USER_GROUP);
      if (isAdmin || isUser) {
        req.user = { username: remoteUser, groups, email: req.headers['remote-email'] || req.headers['x-remote-email'] || '', authedVia: 'proxy' };
        req.session.user = req.user.username;
        req.session.name = null;
        req.session.email = req.user.email || null;
        req.session.avatar = null;
        req.session.isAdmin = isAdmin;
      } else {
        req.session.user = 'guest';
        req.session.isAdmin = false;
      }
    } else if (remoteUser) {
      req.session.user = 'guest';
      req.session.isAdmin = false;
    }
    next();
  });
}

router.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (!username) return res.status(400).json({ error: 'username required' });
  if (username === 'guest') {
    req.session.user = 'guest';
    req.session.name = null;
    req.session.email = null;
    req.session.avatar = null;
    return res.json({ username: 'guest' });
  }
  if (!ldap) return res.status(500).json({ error: 'LDAP not configured' });
  const attr = process.env.LDAP_USER_ATTRIBUTE || 'user_id';
  ldap.authenticate(username, password, (err, user) => {
    if (err || !user) return res.status(401).json({ error: 'Invalid credentials' });
    req.session.user = user[attr] || user.uid || username;
    req.session.name = user.displayName || user.cn || null;
    req.session.email = user.mail || null;
    req.session.avatar = user.thumbnailPhoto || user.jpegPhoto || null;
    req.session.isAdmin = false;
    const adminFilter = process.env.LDAP_ADMIN_FILTER;
    if (adminFilter) {
      const base = process.env.LDAP_SEARCH_BASE;
      const filter = adminFilter.replace('{{username}}', user[attr] || user.uid || username);
      ldap._search(base, { filter, scope: 'sub' }, (e, items) => {
        if (!e && items && items.length) req.session.isAdmin = true;
        res.json({ username: req.session.user });
      });
    } else {
      res.json({ username: req.session.user });
    }
  });
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.sendStatus(204));
});

router.get('/me', async (req, res) => {
  const username = req.session.user || 'guest';
  let nodeId = req.session.meNodeId || null;
  if (username !== 'guest' && !nodeId) {
    const row = await Setting.findOne({ where: { username } });
    if (row) {
      nodeId = row.meNodeId || null;
      req.session.meNodeId = nodeId;
    }
  }
  res.json({ username, name: req.session.name || null, email: req.session.email || null, avatar: req.session.avatar || null, nodeId, admin: !!req.session.isAdmin });
});

router.post('/me', async (req, res) => {
  const nodeId = req.body.nodeId || null;
  req.session.meNodeId = nodeId;
  const username = req.session.user || 'guest';
  if (username !== 'guest') {
    const [row] = await Setting.findOrCreate({ where: { username }, defaults: { theme: 'light', language: 'EN', meNodeId: nodeId, focusedView: false } });
    row.meNodeId = nodeId;
    await row.save();
  }
  res.sendStatus(204);
});

router.get('/settings', async (req, res) => {
  const username = req.session.user || 'guest';
  if (username === 'guest') return res.json(null);
  const [row] = await Setting.findOrCreate({ where: { username }, defaults: { theme: 'light', language: 'EN', meNodeId: null, focusedView: false } });
  res.json({ theme: row.theme, language: row.language, meNodeId: row.meNodeId, focusedView: row.focusedView });
});

router.post('/settings', async (req, res) => {
  const username = req.session.user || 'guest';
  if (username === 'guest') return res.status(401).json({ error: 'Guest user cannot save settings' });
  const [row] = await Setting.findOrCreate({ where: { username }, defaults: { theme: 'light', language: 'EN', meNodeId: null, focusedView: false } });
  if (typeof req.body.theme === 'string') row.theme = req.body.theme;
  if (typeof req.body.language === 'string') row.language = req.body.language;
  if (typeof req.body.meNodeId !== 'undefined') row.meNodeId = req.body.meNodeId;
  if (typeof req.body.focusedView !== 'undefined') row.focusedView = !!req.body.focusedView;
  await row.save();
  res.sendStatus(204);
});

router.get('/score', async (req, res) => {
  const username = req.session.user || 'guest';
  const row = await Score.findOne({ where: { username } });
  res.json({ username, points: row ? row.points : 0 });
});

router.get('/scores', async (_req, res) => {
  const scores = await Score.findAll({ order: [['points', 'DESC']] });
  res.json(scores);
});

router.post('/score/reset', async (_req, res) => {
  if (LOGIN_ENABLED && !(_req.session && _req.session.isAdmin)) return res.status(403).json({ error: 'admin required' });
  await Score.update({ points: 0 }, { where: {} });
  res.sendStatus(204);
});

router.get('/activity', async (_req, res) => {
  const logs = await Activity.findAll({ order: [['createdAt', 'DESC']] });
  res.json(logs);
});

module.exports = router;
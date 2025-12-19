const LOGIN_ENABLED = process.env.LOGIN_ENABLED === 'true';

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

module.exports = { requireAuth, requireAdmin };
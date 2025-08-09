const express = require('express');
const session = require('express-session');
const SequelizeStore = require('connect-session-sequelize')(session.Store);
const { sequelize } = require('./models');
const { verifyGeonames } = require('./services/geonames');

const app = express();
app.use(express.json());

const sessionStore = new SequelizeStore({ db: sequelize });

const trustedProxies = process.env.TRUSTED_PROXY_IPS
  ? process.env.TRUSTED_PROXY_IPS.split(',').map((ip) => ip.trim())
  : [];
app.set('trust proxy', (addr) => trustedProxies.includes(addr));

app.use(
  session({
    secret: process.env.SESSION_SECRET || 'secret',
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
  }),
);

// Debug endpoint to inspect forwarded headers
app.get('/debug/headers', (req, res) => {
  res.json({
    'Remote-User': req.get('Remote-User'),
    'Remote-Email': req.get('Remote-Email'),
    'Remote-Groups': req.get('Remote-Groups'),
    'Remote-Name': req.get('Remote-Name'),
  });
});

// Routes
app.use('/api', require('./routes/meta'));
app.use('/api/people', require('./routes/people'));
app.use('/api/layout', require('./routes/layout'));
app.use('/api', require('./routes/export'));
app.use('/places', require('./routes/places'));

app.sessionStore = sessionStore;

async function init() {
  await verifyGeonames().catch(() => {});
  await sequelize.sync({ alter: true });
  await sessionStore.sync();
}

module.exports = { app, init };
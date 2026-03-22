const path = require('path');
const express = require('express');
const session = require('express-session');
require('dotenv').config();

const pool = require('./config/db');
const { validateEnvironment } = require('./config/env');
const authRoutes = require('./routes/authRoutes');
const betRoutes = require('./routes/betRoutes');
const pageRoutes = require('./routes/pageRoutes');
const { ensureAppSchema } = require('./services/schemaService');
const MySQLSessionStore = require('./services/MySQLSessionStore');

const environment = validateEnvironment();
const schemaReady = ensureAppSchema();
const sessionStore = new MySQLSessionStore({ pool, ready: schemaReady, skipEnsure: true });

const app = express();
app.locals.startup = Promise.all([schemaReady, sessionStore.ready]);

if (environment.trustProxy) {
  app.set('trust proxy', 1);
}

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use('/public', express.static(path.join(__dirname, 'public')));
app.use(
  session({
    name: 'betting_manager.sid',
    secret: process.env.SESSION_SECRET || 'dev-session-secret',
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    proxy: environment.trustProxy,
    unset: 'destroy',
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: environment.isProduction,
      maxAge: 1000 * 60 * 60 * 24 * 14,
    },
  })
);

app.use(async (_req, _res, next) => {
  try {
    await app.locals.startup;
    next();
  } catch (error) {
    next(error);
  }
});

app.get('/healthz', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.status(200).json({ ok: true });
  } catch (error) {
    res.status(500).json({ ok: false });
  }
});

app.get('/readyz', async (_req, res) => {
  try {
    await app.locals.startup;
    await pool.query('SELECT 1');
    res.status(200).json({ ok: true });
  } catch (error) {
    res.status(500).json({ ok: false });
  }
});

app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  res.locals.messages = req.session.messages || [];
  res.locals.currentPath = req.path;
  req.session.messages = [];
  next();
});

app.use('/', pageRoutes);
app.use('/auth', authRoutes);
app.use('/bets', betRoutes);

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).render('404', { title: 'Application error' });
});

app.use((req, res) => {
  res.status(404).render('404', { title: 'Page not found' });
});

module.exports = app;

const path = require('path');
const express = require('express');
const session = require('express-session');
require('dotenv').config();

const authRoutes = require('./routes/authRoutes');
const betRoutes = require('./routes/betRoutes');
const pageRoutes = require('./routes/pageRoutes');

const app = express();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use('/public', express.static(path.join(__dirname, 'public')));
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'dev-session-secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    },
  })
);

app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  res.locals.messages = req.session.messages || [];
  req.session.messages = [];
  next();
});

app.use('/', pageRoutes);
app.use('/auth', authRoutes);
app.use('/bets', betRoutes);

app.use((req, res) => {
  res.status(404).render('404', { title: 'Page not found' });
});

module.exports = app;

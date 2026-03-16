const bcrypt = require('bcrypt');
const pool = require('../config/db');

function renderRegister(req, res) {
  return res.render('auth/register', { title: 'Register' });
}

function renderLogin(req, res) {
  return res.render('auth/login', { title: 'Login' });
}

async function register(req, res) {
  const { name, email, password } = req.body;

  if (!name || !email || !password) {
    req.session.messages = [{ type: 'error', text: 'All fields are required.' }];
    return res.redirect('/auth/register');
  }

  try {
    const [existing] = await pool.query('SELECT id FROM users WHERE email = ?', [email]);
    if (existing.length) {
      req.session.messages = [{ type: 'error', text: 'Email is already registered.' }];
      return res.redirect('/auth/register');
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const [result] = await pool.query(
      'INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)',
      [name, email, passwordHash]
    );

    req.session.user = { id: result.insertId, name, email };
    req.session.messages = [{ type: 'success', text: 'Account created successfully.' }];
    return res.redirect('/dashboard');
  } catch (error) {
    req.session.messages = [{ type: 'error', text: 'Unable to register at the moment.' }];
    return res.redirect('/auth/register');
  }
}

async function login(req, res) {
  const { email, password } = req.body;

  if (!email || !password) {
    req.session.messages = [{ type: 'error', text: 'Email and password are required.' }];
    return res.redirect('/auth/login');
  }

  try {
    const [users] = await pool.query('SELECT id, name, email, password_hash FROM users WHERE email = ?', [email]);

    if (!users.length) {
      req.session.messages = [{ type: 'error', text: 'Invalid credentials.' }];
      return res.redirect('/auth/login');
    }

    const user = users[0];
    const isMatch = await bcrypt.compare(password, user.password_hash);

    if (!isMatch) {
      req.session.messages = [{ type: 'error', text: 'Invalid credentials.' }];
      return res.redirect('/auth/login');
    }

    req.session.user = { id: user.id, name: user.name, email: user.email };
    req.session.messages = [{ type: 'success', text: 'Welcome back!' }];
    return res.redirect('/dashboard');
  } catch (error) {
    req.session.messages = [{ type: 'error', text: 'Unable to log in at the moment.' }];
    return res.redirect('/auth/login');
  }
}

function logout(req, res) {
  req.session.destroy(() => {
    res.redirect('/');
  });
}

module.exports = {
  renderRegister,
  renderLogin,
  register,
  login,
  logout,
};

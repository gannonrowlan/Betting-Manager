const bcrypt = require('bcrypt');
const pool = require('../config/db');
const loginRateLimitMiddleware = require('../middleware/loginRateLimitMiddleware');

const REMEMBER_ME_MAX_AGE = 1000 * 60 * 60 * 24 * 30;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const COMMON_PASSWORDS = new Set([
  '1234567890',
  '1111111111',
  '12345678',
  '123456789',
  'qwerty123',
  'password',
  'password1',
  'password123',
  'letmein',
  'admin123',
]);

function setSessionLifetime(req, rememberMe) {
  if (rememberMe) {
    req.session.cookie.maxAge = REMEMBER_ME_MAX_AGE;
    return;
  }

  req.session.cookie.expires = false;
  req.session.cookie.maxAge = null;
}

function regenerateSession(req) {
  return new Promise((resolve, reject) => {
    req.session.regenerate((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

function isValidName(name) {
  return name.length >= 2 && name.length <= 80;
}

function isValidEmail(email) {
  return EMAIL_PATTERN.test(email);
}

function passwordContainsPersonalInfo(password, name, email) {
  const normalizedPassword = password.toLowerCase();
  const normalizedEmail = email.toLowerCase();
  const emailLocalPart = normalizedEmail.split('@')[0] || '';
  const nameParts = name
    .toLowerCase()
    .split(/\s+/)
    .map((part) => part.replace(/[^a-z0-9]/g, ''))
    .filter((part) => part.length >= 3);

  if (normalizedEmail && normalizedPassword.includes(normalizedEmail)) {
    return true;
  }

  if (emailLocalPart.length >= 3 && normalizedPassword.includes(emailLocalPart)) {
    return true;
  }

  return nameParts.some((part) => normalizedPassword.includes(part));
}

function isCommonPassword(password) {
  return COMMON_PASSWORDS.has(password.toLowerCase());
}

function renderRegister(req, res) {
  if (req.session.user) {
    const returnTo = req.session.returnTo;
    req.session.returnTo = null;
    return res.redirect(returnTo || '/dashboard');
  }

  const formData = req.session.formData || { rememberMe: true };
  req.session.formData = null;

  return res.render('auth/register', { title: 'Register', formData });
}

function renderLogin(req, res) {
  if (req.session.user) {
    const returnTo = req.session.returnTo;
    req.session.returnTo = null;
    return res.redirect(returnTo || '/dashboard');
  }

  const formData = req.session.formData || { rememberMe: true };
  req.session.formData = null;

  return res.render('auth/login', { title: 'Login', formData });
}

function renderAccount(req, res) {
  const formData = req.session.accountFormData || {
    name: req.session.user?.name || '',
    email: req.session.user?.email || '',
  };
  req.session.accountFormData = null;

  return res.render('settings/account', {
    title: 'Account',
    formData,
  });
}

async function register(req, res) {
  const name = (req.body.name || '').trim();
  const email = (req.body.email || '').trim().toLowerCase();
  const password = req.body.password || '';
  const confirmPassword = req.body.confirmPassword || '';
  const rememberMe = req.body.rememberMe === 'on';

  req.session.formData = { name, email, rememberMe };

  if (!name || !email || !password) {
    req.session.messages = [{ type: 'error', text: 'All fields are required.' }];
    return res.redirect('/auth/register');
  }

  if (!isValidName(name)) {
    req.session.messages = [{ type: 'error', text: 'Name must be between 2 and 80 characters.' }];
    return res.redirect('/auth/register');
  }

  if (!isValidEmail(email)) {
    req.session.messages = [{ type: 'error', text: 'Enter a valid email address.' }];
    return res.redirect('/auth/register');
  }

  if (password.length < 10) {
    req.session.messages = [{ type: 'error', text: 'Password must be at least 10 characters.' }];
    return res.redirect('/auth/register');
  }

  if (passwordContainsPersonalInfo(password, name, email)) {
    req.session.messages = [{ type: 'error', text: 'Password cannot include your name or email.' }];
    return res.redirect('/auth/register');
  }

  if (isCommonPassword(password)) {
    req.session.messages = [{ type: 'error', text: 'Choose a less common password.' }];
    return res.redirect('/auth/register');
  }

  if (password !== confirmPassword) {
    req.session.messages = [{ type: 'error', text: 'Passwords do not match.' }];
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

    const returnTo = req.session.returnTo;
    await regenerateSession(req);
    req.session.user = { id: result.insertId, name, email };
    req.session.returnTo = null;
    setSessionLifetime(req, rememberMe);
    req.session.messages = [{ type: 'success', text: 'Account created successfully.' }];
    return res.redirect(returnTo || '/dashboard');
  } catch (error) {
    req.session.messages = [{ type: 'error', text: 'Unable to register at the moment.' }];
    return res.redirect('/auth/register');
  }
}

async function login(req, res) {
  const email = (req.body.email || '').trim().toLowerCase();
  const password = req.body.password || '';
  const rememberMe = req.body.rememberMe === 'on';

  req.session.formData = { email, rememberMe };

  if (!email || !password) {
    req.session.messages = [{ type: 'error', text: 'Email and password are required.' }];
    return res.redirect('/auth/login');
  }

  if (!isValidEmail(email)) {
    req.session.messages = [{ type: 'error', text: 'Enter a valid email address.' }];
    return res.redirect('/auth/login');
  }

  try {
    const [users] = await pool.query('SELECT id, name, email, password_hash FROM users WHERE email = ?', [email]);

    if (!users.length) {
      loginRateLimitMiddleware.recordFailedLogin(req);
      req.session.messages = [{ type: 'error', text: 'Invalid credentials.' }];
      return res.redirect('/auth/login');
    }

    const user = users[0];
    const isMatch = await bcrypt.compare(password, user.password_hash);

    if (!isMatch) {
      loginRateLimitMiddleware.recordFailedLogin(req);
      req.session.messages = [{ type: 'error', text: 'Invalid credentials.' }];
      return res.redirect('/auth/login');
    }

    loginRateLimitMiddleware.clearFailedLogins(req);
    const returnTo = req.session.returnTo;
    await regenerateSession(req);
    req.session.user = { id: user.id, name: user.name, email: user.email };
    req.session.returnTo = null;
    setSessionLifetime(req, rememberMe);
    req.session.messages = [{ type: 'success', text: 'Welcome back!' }];
    return res.redirect(returnTo || '/dashboard');
  } catch (error) {
    req.session.messages = [{ type: 'error', text: 'Unable to log in at the moment.' }];
    return res.redirect('/auth/login');
  }
}

async function updateAccount(req, res) {
  const userId = req.session.user.id;
  const name = (req.body.name || '').trim();
  const email = (req.body.email || '').trim().toLowerCase();
  const currentPassword = req.body.currentPassword || '';
  const newPassword = req.body.newPassword || '';
  const confirmPassword = req.body.confirmPassword || '';

  req.session.accountFormData = { name, email };

  if (!name || !email) {
    req.session.messages = [{ type: 'error', text: 'Name and email are required.' }];
    return res.redirect('/settings/account');
  }

  if (!isValidName(name)) {
    req.session.messages = [{ type: 'error', text: 'Name must be between 2 and 80 characters.' }];
    return res.redirect('/settings/account');
  }

  if (!isValidEmail(email)) {
    req.session.messages = [{ type: 'error', text: 'Enter a valid email address.' }];
    return res.redirect('/settings/account');
  }

  try {
    const [users] = await pool.query('SELECT id, name, email, password_hash FROM users WHERE id = ?', [userId]);

    if (!users.length) {
      req.session.messages = [{ type: 'error', text: 'Account not found.' }];
      return res.redirect('/auth/login');
    }

    const user = users[0];

    const [existing] = await pool.query('SELECT id FROM users WHERE email = ? AND id <> ?', [email, userId]);
    if (existing.length) {
      req.session.messages = [{ type: 'error', text: 'That email is already in use.' }];
      return res.redirect('/settings/account');
    }

    let nextPasswordHash = user.password_hash;

    if (newPassword || confirmPassword || currentPassword) {
      if (!currentPassword) {
        req.session.messages = [{ type: 'error', text: 'Enter your current password to change it.' }];
        return res.redirect('/settings/account');
      }

      const currentPasswordMatches = await bcrypt.compare(currentPassword, user.password_hash);
      if (!currentPasswordMatches) {
        req.session.messages = [{ type: 'error', text: 'Current password is incorrect.' }];
        return res.redirect('/settings/account');
      }

      if (newPassword.length < 10) {
        req.session.messages = [{ type: 'error', text: 'New password must be at least 10 characters.' }];
        return res.redirect('/settings/account');
      }

      if (passwordContainsPersonalInfo(newPassword, name, email)) {
        req.session.messages = [{ type: 'error', text: 'New password cannot include your name or email.' }];
        return res.redirect('/settings/account');
      }

      if (isCommonPassword(newPassword)) {
        req.session.messages = [{ type: 'error', text: 'Choose a less common password.' }];
        return res.redirect('/settings/account');
      }

      if (newPassword !== confirmPassword) {
        req.session.messages = [{ type: 'error', text: 'New passwords do not match.' }];
        return res.redirect('/settings/account');
      }

      nextPasswordHash = await bcrypt.hash(newPassword, 10);
    }

    await pool.query('UPDATE users SET name = ?, email = ?, password_hash = ? WHERE id = ?', [
      name,
      email,
      nextPasswordHash,
      userId,
    ]);

    req.session.user = {
      ...req.session.user,
      name,
      email,
    };
    req.session.accountFormData = null;
    req.session.messages = [{ type: 'success', text: 'Account updated successfully.' }];
    return res.redirect('/settings/account');
  } catch (error) {
    req.session.messages = [{ type: 'error', text: 'Unable to update your account right now.' }];
    return res.redirect('/settings/account');
  }
}

function logout(req, res) {
  req.session.destroy(() => {
    res.redirect('/');
  });
}

module.exports = {
  renderAccount,
  renderRegister,
  renderLogin,
  register,
  login,
  updateAccount,
  logout,
};

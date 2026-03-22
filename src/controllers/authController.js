const bcrypt = require('bcrypt');
const pool = require('../config/db');
const loginRateLimitMiddleware = require('../middleware/loginRateLimitMiddleware');
const {
  isValidEmail,
  isValidName,
  validatePasswordStrength,
} = require('../services/authService');
const {
  createPasswordResetToken,
  findActivePasswordReset,
  markPasswordResetUsed,
} = require('../services/passwordResetService');

const REMEMBER_ME_MAX_AGE = 1000 * 60 * 60 * 24 * 30;

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

function saveSession(req) {
  return new Promise((resolve, reject) => {
    req.session.save((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

function getAppBaseUrl(req) {
  const configured = String(process.env.APP_BASE_URL || '').trim();
  if (configured) {
    return configured.replace(/\/$/, '');
  }

  return `${req.protocol}://${req.get('host')}`;
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

function renderForgotPassword(req, res) {
  if (req.session.user) {
    return res.redirect('/dashboard');
  }

  const formData = req.session.passwordResetRequestFormData || {};
  const devResetLink = req.session.devPasswordResetLink || '';
  req.session.passwordResetRequestFormData = null;
  req.session.devPasswordResetLink = null;

  return res.render('auth/forgotPassword', {
    title: 'Forgot Password',
    formData,
    devResetLink,
  });
}

async function renderResetPassword(req, res) {
  if (req.session.user) {
    return res.redirect('/dashboard');
  }

  const token = String(req.query.token || '').trim();

  if (!token) {
    req.session.messages = [{ type: 'error', text: 'Password reset link is missing a token.' }];
    return res.redirect('/auth/forgot-password');
  }

  const resetRequest = await findActivePasswordReset(token);
  if (!resetRequest) {
    req.session.messages = [{ type: 'error', text: 'This password reset link is invalid or has expired.' }];
    return res.redirect('/auth/forgot-password');
  }

  const formData = req.session.passwordResetFormData || {};
  req.session.passwordResetFormData = null;

  return res.render('auth/resetPassword', {
    title: 'Reset Password',
    formData,
    token,
  });
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

async function requestPasswordReset(req, res) {
  const email = (req.body.email || '').trim().toLowerCase();
  req.session.passwordResetRequestFormData = { email };

  if (!email) {
    req.session.messages = [{ type: 'error', text: 'Email is required.' }];
    return res.redirect('/auth/forgot-password');
  }

  if (!isValidEmail(email)) {
    req.session.messages = [{ type: 'error', text: 'Enter a valid email address.' }];
    return res.redirect('/auth/forgot-password');
  }

  try {
    const [users] = await pool.query('SELECT id FROM users WHERE email = ?', [email]);

    req.session.passwordResetRequestFormData = null;
    req.session.devPasswordResetLink = null;

    if (users.length) {
      const resetToken = await createPasswordResetToken(users[0].id);

      if (process.env.NODE_ENV !== 'production') {
        const resetLink = `${getAppBaseUrl(req)}/auth/reset-password?token=${resetToken.plainToken}`;
        req.session.devPasswordResetLink = resetLink;
      }
    }

    req.session.messages = [{
      type: 'success',
      text: 'If that email is registered, a password reset link is now ready.',
    }];
    return res.redirect('/auth/forgot-password');
  } catch (error) {
    req.session.messages = [{ type: 'error', text: 'Unable to start a password reset right now.' }];
    return res.redirect('/auth/forgot-password');
  }
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

  const passwordError = validatePasswordStrength(password, { name, email });
  if (passwordError) {
    req.session.messages = [{ type: 'error', text: passwordError }];
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
    await saveSession(req);
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
    await saveSession(req);
    return res.redirect(returnTo || '/dashboard');
  } catch (error) {
    req.session.messages = [{ type: 'error', text: 'Unable to log in at the moment.' }];
    return res.redirect('/auth/login');
  }
}

async function resetPassword(req, res) {
  const token = String(req.body.token || '').trim();
  const password = req.body.password || '';
  const confirmPassword = req.body.confirmPassword || '';

  req.session.passwordResetFormData = { token };

  if (!token) {
    req.session.messages = [{ type: 'error', text: 'Password reset token is missing.' }];
    return res.redirect('/auth/forgot-password');
  }

  if (!password || !confirmPassword) {
    req.session.messages = [{ type: 'error', text: 'Enter and confirm your new password.' }];
    return res.redirect(`/auth/reset-password?token=${encodeURIComponent(token)}`);
  }

  try {
    const resetRequest = await findActivePasswordReset(token);
    if (!resetRequest) {
      req.session.messages = [{ type: 'error', text: 'This password reset link is invalid or has expired.' }];
      return res.redirect('/auth/forgot-password');
    }

    const passwordError = validatePasswordStrength(password, {
      name: resetRequest.name || '',
      email: resetRequest.email || '',
    });
    if (passwordError) {
      req.session.messages = [{ type: 'error', text: passwordError }];
      return res.redirect(`/auth/reset-password?token=${encodeURIComponent(token)}`);
    }

    if (password !== confirmPassword) {
      req.session.messages = [{ type: 'error', text: 'Passwords do not match.' }];
      return res.redirect(`/auth/reset-password?token=${encodeURIComponent(token)}`);
    }

    const passwordHash = await bcrypt.hash(password, 10);
    await pool.query('UPDATE users SET password_hash = ? WHERE id = ?', [passwordHash, resetRequest.user_id]);
    await markPasswordResetUsed(resetRequest.id);

    req.session.passwordResetFormData = null;
    req.session.messages = [{ type: 'success', text: 'Password updated. You can log in with your new password.' }];
    await saveSession(req);
    return res.redirect('/auth/login');
  } catch (error) {
    req.session.messages = [{ type: 'error', text: 'Unable to reset your password right now.' }];
    return res.redirect(`/auth/reset-password?token=${encodeURIComponent(token)}`);
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

      const passwordError = validatePasswordStrength(newPassword, { name, email });
      if (passwordError) {
        req.session.messages = [{ type: 'error', text: passwordError.replace(/^Password/, 'New password') }];
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
    await saveSession(req);
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
  renderForgotPassword,
  renderRegister,
  renderLogin,
  renderResetPassword,
  register,
  login,
  requestPasswordReset,
  resetPassword,
  updateAccount,
  logout,
};

const crypto = require('crypto');

const RESET_TOKEN_BYTES = 32;
const RESET_TOKEN_TTL_MINUTES = 60;
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

function validatePasswordStrength(password, { name = '', email = '' } = {}) {
  if (password.length < 10) {
    return 'Password must be at least 10 characters.';
  }

  if (passwordContainsPersonalInfo(password, name, email)) {
    return 'Password cannot include your name or email.';
  }

  if (isCommonPassword(password)) {
    return 'Choose a less common password.';
  }

  return null;
}

function generatePasswordResetToken() {
  const plainToken = crypto.randomBytes(RESET_TOKEN_BYTES).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(plainToken).digest('hex');
  const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MINUTES * 60 * 1000);

  return {
    plainToken,
    tokenHash,
    expiresAt,
  };
}

function hashPasswordResetToken(token) {
  return crypto.createHash('sha256').update(String(token || '')).digest('hex');
}

module.exports = {
  COMMON_PASSWORDS,
  RESET_TOKEN_TTL_MINUTES,
  generatePasswordResetToken,
  hashPasswordResetToken,
  isCommonPassword,
  isValidEmail,
  isValidName,
  passwordContainsPersonalInfo,
  validatePasswordStrength,
};

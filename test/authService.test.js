const test = require('node:test');
const assert = require('node:assert/strict');

const {
  generatePasswordResetToken,
  hashPasswordResetToken,
  isValidEmail,
  isValidName,
  passwordContainsPersonalInfo,
  validatePasswordStrength,
} = require('../src/services/authService');
const { parseBoolean, validateEnvironment } = require('../src/config/env');
const { formatUtcDateTime } = require('../src/services/passwordResetService');
const { loadSchemaStatements } = require('../src/services/schemaService');

test('auth validation helpers accept valid profile values', () => {
  assert.equal(isValidName('Rowan Kelly'), true);
  assert.equal(isValidEmail('rowan@example.com'), true);
  assert.equal(passwordContainsPersonalInfo('safe-super-secret', 'Rowan Kelly', 'rowan@example.com'), false);
});

test('validatePasswordStrength rejects short, personal, and common passwords', () => {
  assert.equal(
    validatePasswordStrength('short', { name: 'Rowan Kelly', email: 'rowan@example.com' }),
    'Password must be at least 10 characters.'
  );
  assert.equal(
    validatePasswordStrength('rowan-bets-2026', { name: 'Rowan Kelly', email: 'rowan@example.com' }),
    'Password cannot include your name or email.'
  );
  assert.equal(
    validatePasswordStrength('password123', { name: 'Rowan Kelly', email: 'rowan@example.com' }),
    'Choose a less common password.'
  );
  assert.equal(
    validatePasswordStrength('sharp-bankroll-2026', { name: 'Rowan Kelly', email: 'rowan@example.com' }),
    null
  );
});

test('password reset tokens are hashed and expire in the future', () => {
  const token = generatePasswordResetToken();

  assert.equal(token.plainToken.length, 64);
  assert.equal(token.tokenHash.length, 64);
  assert.notEqual(token.plainToken, token.tokenHash);
  assert.equal(hashPasswordResetToken(token.plainToken), token.tokenHash);
  assert.ok(token.expiresAt.getTime() > Date.now());
});

test('formatUtcDateTime writes SQL-safe UTC timestamps', () => {
  assert.equal(
    formatUtcDateTime(new Date('2026-03-22T18:45:12.000Z')),
    '2026-03-22 18:45:12'
  );
});

test('environment helpers parse booleans and enforce production secrets', () => {
  assert.equal(parseBoolean('true'), true);
  assert.equal(parseBoolean('off', true), false);

  const originalEnv = { ...process.env };

  process.env.NODE_ENV = 'production';
  process.env.DB_HOST = 'localhost';
  process.env.DB_USER = 'user';
  process.env.DB_PASSWORD = 'pass';
  process.env.DB_NAME = 'betting_manager';
  process.env.SESSION_SECRET = 'replace-me-with-real-secret';

  const validated = validateEnvironment();
  assert.equal(validated.isProduction, true);

  process.env.SESSION_SECRET = 'dev-session-secret';
  assert.throws(() => validateEnvironment(), /SESSION_SECRET must not use the development fallback/);

  process.env = originalEnv;
});

test('loadSchemaStatements strips database selection statements and keeps table ddl', () => {
  const statements = loadSchemaStatements();

  assert.equal(statements.some((statement) => /^CREATE DATABASE\b/i.test(statement)), false);
  assert.equal(statements.some((statement) => /^USE\b/i.test(statement)), false);
  assert.equal(
    statements.some((statement) => statement.includes('CREATE TABLE IF NOT EXISTS users')),
    true
  );
  assert.equal(
    statements.some((statement) => statement.includes('CREATE TABLE IF NOT EXISTS password_reset_tokens')),
    true
  );
});

const pool = require('../config/db');
const {
  generatePasswordResetToken,
  hashPasswordResetToken,
} = require('./authService');

function formatUtcDateTime(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return '';
  }

  return date.toISOString().slice(0, 19).replace('T', ' ');
}

async function createPasswordResetToken(userId) {
  const { plainToken, tokenHash, expiresAt } = generatePasswordResetToken();
  const now = formatUtcDateTime(new Date());
  const expiresAtSql = formatUtcDateTime(expiresAt);

  await pool.query(
    `DELETE FROM password_reset_tokens
      WHERE user_id = ?
        OR expires_at <= ?
        OR used_at IS NOT NULL`,
    [userId, now]
  );

  await pool.query(
    `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
      VALUES (?, ?, ?)`,
    [userId, tokenHash, expiresAtSql]
  );

  return {
    plainToken,
    expiresAt,
  };
}

async function findActivePasswordReset(token) {
  const tokenHash = hashPasswordResetToken(token);
  const now = formatUtcDateTime(new Date());
  const [rows] = await pool.query(
    `SELECT password_reset_tokens.id, password_reset_tokens.user_id, password_reset_tokens.expires_at, users.email, users.name
      FROM password_reset_tokens
      INNER JOIN users ON users.id = password_reset_tokens.user_id
      WHERE password_reset_tokens.token_hash = ?
        AND password_reset_tokens.used_at IS NULL
        AND password_reset_tokens.expires_at > ?
      LIMIT 1`,
    [tokenHash, now]
  );

  return rows[0] || null;
}

async function markPasswordResetUsed(resetId) {
  const usedAt = formatUtcDateTime(new Date());
  await pool.query(
    `UPDATE password_reset_tokens
      SET used_at = ?
      WHERE id = ?`,
    [usedAt, resetId]
  );
}

module.exports = {
  createPasswordResetToken,
  findActivePasswordReset,
  formatUtcDateTime,
  markPasswordResetUsed,
};

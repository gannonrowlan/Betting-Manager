const pool = require('../config/db');

let profileTableEnsured = false;

async function ensureProfileTable() {
  if (profileTableEnsured) {
    return;
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS bankroll_profiles (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL UNIQUE,
      starting_bankroll DECIMAL(10, 2) NOT NULL DEFAULT 0,
      unit_size DECIMAL(10, 2) NOT NULL DEFAULT 10,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT fk_bankroll_profiles_users FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  profileTableEnsured = true;
}

async function getOrCreateProfile(userId) {
  await ensureProfileTable();

  const [rows] = await pool.query(
    'SELECT starting_bankroll AS startingBankroll, unit_size AS unitSize FROM bankroll_profiles WHERE user_id = ?',
    [userId]
  );

  if (rows.length) {
    return {
      startingBankroll: Number(rows[0].startingBankroll),
      unitSize: Number(rows[0].unitSize),
    };
  }

  await pool.query('INSERT INTO bankroll_profiles (user_id, starting_bankroll, unit_size) VALUES (?, ?, ?)', [
    userId,
    0,
    10,
  ]);

  return {
    startingBankroll: 0,
    unitSize: 10,
  };
}

async function updateProfile(userId, { startingBankroll, unitSize }) {
  await ensureProfileTable();

  await pool.query(
    `INSERT INTO bankroll_profiles (user_id, starting_bankroll, unit_size)
      VALUES (?, ?, ?)
      ON DUPLICATE KEY UPDATE
        starting_bankroll = VALUES(starting_bankroll),
        unit_size = VALUES(unit_size)`,
    [userId, startingBankroll, unitSize]
  );
}

module.exports = {
  getOrCreateProfile,
  updateProfile,
};
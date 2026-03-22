const pool = require('../config/db');

async function getOrCreateProfile(userId) {
  const [rows] = await pool.query(
    `SELECT
      starting_bankroll AS startingBankroll,
      unit_size AS unitSize,
      add_bet_tips_dismissed AS addBetTipsDismissed
    FROM bankroll_profiles
    WHERE user_id = ?`,
    [userId]
  );

  if (rows.length) {
    return {
      startingBankroll: Number(rows[0].startingBankroll),
      unitSize: Number(rows[0].unitSize),
      addBetTipsDismissed: Boolean(rows[0].addBetTipsDismissed),
    };
  }

  await pool.query(
    'INSERT INTO bankroll_profiles (user_id, starting_bankroll, unit_size, add_bet_tips_dismissed) VALUES (?, ?, ?, ?)',
    [
    userId,
    0,
    10,
    0,
    ]
  );

  return {
    startingBankroll: 0,
    unitSize: 10,
    addBetTipsDismissed: false,
  };
}

async function updateProfile(userId, { startingBankroll, unitSize }) {
  await pool.query(
    `INSERT INTO bankroll_profiles (user_id, starting_bankroll, unit_size)
      VALUES (?, ?, ?)
      ON DUPLICATE KEY UPDATE
        starting_bankroll = VALUES(starting_bankroll),
        unit_size = VALUES(unit_size)`,
    [userId, startingBankroll, unitSize]
  );
}

async function dismissAddBetTips(userId) {
  await pool.query(
    `INSERT INTO bankroll_profiles (user_id, add_bet_tips_dismissed)
      VALUES (?, 1)
      ON DUPLICATE KEY UPDATE
        add_bet_tips_dismissed = VALUES(add_bet_tips_dismissed)`,
    [userId]
  );
}

async function getBankrollTransactions(userId) {
  const [rows] = await pool.query(
    `SELECT
      id,
      transaction_type AS transactionType,
      amount,
      transaction_date AS transactionDate,
      notes,
      created_at AS createdAt
    FROM bankroll_transactions
    WHERE user_id = ?
    ORDER BY transaction_date DESC, created_at DESC`,
    [userId]
  );

  return rows.map((row) => ({
    id: row.id,
    transactionType: row.transactionType,
    amount: Number(row.amount),
    transactionDate: row.transactionDate,
    notes: row.notes || '',
    createdAt: row.createdAt,
  }));
}

async function createBankrollTransaction(userId, { transactionType, amount, transactionDate, notes }) {
  await pool.query(
    `INSERT INTO bankroll_transactions (user_id, transaction_type, amount, transaction_date, notes)
      VALUES (?, ?, ?, ?, ?)`,
    [userId, transactionType, amount, transactionDate, notes || null]
  );
}

async function deleteBankrollTransaction(userId, transactionId) {
  await pool.query(
    'DELETE FROM bankroll_transactions WHERE id = ? AND user_id = ?',
    [transactionId, userId]
  );
}

module.exports = {
  createBankrollTransaction,
  deleteBankrollTransaction,
  dismissAddBetTips,
  getBankrollTransactions,
  getOrCreateProfile,
  updateProfile,
};

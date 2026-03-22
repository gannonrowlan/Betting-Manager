const bcrypt = require('bcrypt');

const pool = require('../src/config/db');
const { ensureAppSchema } = require('../src/services/schemaService');
const { calculateProfitLoss } = require('../src/services/statsService');

const DEMO_EMAIL = 'demo@bankrolliq.local';
const DEMO_PASSWORD = 'demo-bankroll-2026';
const DEMO_NAME = 'Demo User';

const bets = [
  ['2026-03-10', 'NBA', 'FanDuel', 'Spread', null, 'Lakers -4.5', -110, 22, 'win', 'Late injury edge'],
  ['2026-03-11', 'NBA', 'DraftKings', 'Total', null, 'Celtics vs Heat Over 221.5', -108, 18, 'loss', 'Bad pace read'],
  ['2026-03-12', 'NHL', 'bet365', 'Moneyline', null, 'Rangers', 135, 16, 'win', 'Plus-money dog'],
  ['2026-03-14', 'NFL', 'Caesars', 'Player Prop', null, 'Mahomes Passing Yards Over 289.5', -115, 20, 'push', 'Hook landed'],
  ['2026-03-15', 'UFC', 'DraftKings', 'Moneyline', null, 'Main event underdog', 155, 12, 'win', 'Good closing number'],
  ['2026-03-17', 'MLB', 'Fanatics Sportsbook', 'Team Prop', null, 'Dodgers Team Total Over 4.5', -105, 14, 'loss', 'Bullpen collapse'],
];

const transactions = [
  ['deposit', 500, '2026-03-01', 'Opening bankroll'],
  ['deposit', 150, '2026-03-18', 'Added funds after bonus'],
  ['withdrawal', 75, '2026-03-21', 'Pulled some profit'],
];

async function main() {
  await ensureAppSchema();

  const [existingUsers] = await pool.query('SELECT id FROM users WHERE email = ?', [DEMO_EMAIL]);
  let userId = existingUsers[0]?.id;

  if (userId) {
    await pool.query('DELETE FROM users WHERE id = ?', [userId]);
  }

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const [userResult] = await pool.query(
    'INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)',
    [DEMO_NAME, DEMO_EMAIL, passwordHash]
  );
  userId = userResult.insertId;

  await pool.query(
    'INSERT INTO bankroll_profiles (user_id, starting_bankroll, unit_size, add_bet_tips_dismissed) VALUES (?, ?, ?, ?)',
    [userId, 500, 10, 1]
  );

  for (const [betDate, sport, sportsbook, betType, legCount, market, odds, stake, result, notes] of bets) {
    await pool.query(
      `INSERT INTO bets
      (user_id, sport, sportsbook, bet_type, leg_count, market, odds, stake, result, profit_loss, bet_date, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        userId,
        sport,
        sportsbook,
        betType,
        legCount,
        market,
        odds,
        stake,
        result,
        calculateProfitLoss({ odds, stake, result }),
        betDate,
        notes,
      ]
    );
  }

  for (const [transactionType, amount, transactionDate, notes] of transactions) {
    await pool.query(
      `INSERT INTO bankroll_transactions (user_id, transaction_type, amount, transaction_date, notes)
        VALUES (?, ?, ?, ?, ?)`,
      [userId, transactionType, amount, transactionDate, notes]
    );
  }

  console.log(`Seeded demo user: ${DEMO_EMAIL}`);
  console.log(`Demo password: ${DEMO_PASSWORD}`);
  await pool.end();
}

main().catch(async (error) => {
  console.error(error);
  await pool.end();
  process.exit(1);
});

const pool = require('../config/db');

function renderLanding(req, res) {
  if (req.session.user) {
    return res.redirect('/dashboard');
  }

  return res.render('landing', { title: 'Bankroll IQ | Sports Betting Manager' });
}

async function renderDashboard(req, res) {
  const userId = req.session.user.id;

  const [[summary]] = await pool.query(
    `SELECT
      COUNT(*) AS totalBets,
      SUM(CASE WHEN result = 'win' THEN 1 ELSE 0 END) AS wins,
      SUM(CASE WHEN result = 'loss' THEN 1 ELSE 0 END) AS losses,
      ROUND(SUM(stake), 2) AS totalStake,
      ROUND(SUM(profit_loss), 2) AS netProfit
    FROM bets
    WHERE user_id = ?`,
    [userId]
  );

  const [recentBets] = await pool.query(
    'SELECT * FROM bets WHERE user_id = ? ORDER BY bet_date DESC, created_at DESC LIMIT 5',
    [userId]
  );

  const totalBets = summary.totalBets || 0;
  const wins = summary.wins || 0;
  const winRate = totalBets ? ((wins / totalBets) * 100).toFixed(1) : '0.0';
  const totalStake = Number(summary.totalStake || 0);
  const netProfit = Number(summary.netProfit || 0);
  const roi = totalStake ? ((netProfit / totalStake) * 100).toFixed(1) : '0.0';

  return res.render('dashboard', {
    title: 'Dashboard',
    stats: {
      totalBets,
      wins,
      losses: summary.losses || 0,
      totalStake,
      netProfit,
      winRate,
      roi,
    },
    recentBets,
  });
}

async function renderStats(req, res) {
  const userId = req.session.user.id;

  const [sportStats] = await pool.query(
    `SELECT
      sport,
      COUNT(*) AS totalBets,
      ROUND(SUM(stake), 2) AS totalStake,
      ROUND(SUM(profit_loss), 2) AS netProfit,
      SUM(CASE WHEN result = 'win' THEN 1 ELSE 0 END) AS wins
    FROM bets
    WHERE user_id = ?
    GROUP BY sport
    ORDER BY totalBets DESC`,
    [userId]
  );

  const [betTypeStats] = await pool.query(
    `SELECT
      bet_type AS betType,
      COUNT(*) AS totalBets,
      ROUND(SUM(profit_loss), 2) AS netProfit
    FROM bets
    WHERE user_id = ?
    GROUP BY bet_type
    ORDER BY totalBets DESC`,
    [userId]
  );

  return res.render('stats', {
    title: 'Stats',
    sportStats,
    betTypeStats,
  });
}

module.exports = {
  renderLanding,
  renderDashboard,
  renderStats,
};

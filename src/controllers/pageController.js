const pool = require('../config/db');
const { calculateRoi, calculateWinRate } = require('../services/statsService');

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
  const wins = Number(summary.wins || 0);
  const losses = Number(summary.losses || 0);
  const pushes = totalBets - wins - losses;
  const winRate = calculateWinRate({ wins, losses });
  const totalStake = Number(summary.totalStake || 0);
  const netProfit = Number(summary.netProfit || 0);
  const roi = calculateRoi({ netProfit, totalStake });

  let performanceMessage = 'Start logging bets to unlock your performance insights.';
  if (totalBets > 0) {
    if (netProfit > 0) {
      performanceMessage = `Great work — you are up $${netProfit.toFixed(2)} with a ${roi}% ROI.`;
    } else if (netProfit < 0) {
      performanceMessage = `You are down $${Math.abs(netProfit).toFixed(2)}. Review recent bets and tighten your unit sizing.`;
    } else {
      performanceMessage = 'You are break-even right now. Keep tracking for a clearer edge signal.';
    }
  }

  return res.render('dashboard', {
    title: 'Dashboard',
    stats: {
      totalBets,
      wins,
      losses,
      pushes,
      totalStake,
      netProfit,
      winRate,
      roi,
    },
    recentBets,
    performanceMessage,
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
      SUM(CASE WHEN result = 'win' THEN 1 ELSE 0 END) AS wins,
      SUM(CASE WHEN result = 'loss' THEN 1 ELSE 0 END) AS losses
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

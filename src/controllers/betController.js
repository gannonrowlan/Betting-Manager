const pool = require('../config/db');

function renderAddBet(req, res) {
  return res.render('bets/add', { title: 'Add Bet' });
}

async function createBet(req, res) {
  const userId = req.session.user.id;
  const { sport, betType, market, odds, stake, result, betDate, notes } = req.body;

  if (!sport || !betType || !market || !odds || !stake || !result || !betDate) {
    req.session.messages = [{ type: 'error', text: 'Please fill out all required fields.' }];
    return res.redirect('/bets/new');
  }

  const parsedOdds = Number(odds);
  const parsedStake = Number(stake);
  let profitLoss = 0;

  if (result === 'win') {
    if (parsedOdds > 0) {
      profitLoss = (parsedStake * parsedOdds) / 100;
    } else {
      profitLoss = (parsedStake * 100) / Math.abs(parsedOdds);
    }
  }

  if (result === 'loss') {
    profitLoss = -parsedStake;
  }

  try {
    await pool.query(
      `INSERT INTO bets
      (user_id, sport, bet_type, market, odds, stake, result, profit_loss, bet_date, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [userId, sport, betType, market, parsedOdds, parsedStake, result, profitLoss, betDate, notes || null]
    );

    req.session.messages = [{ type: 'success', text: 'Bet added.' }];
    return res.redirect('/bets/history');
  } catch (error) {
    req.session.messages = [{ type: 'error', text: 'Unable to save bet.' }];
    return res.redirect('/bets/new');
  }
}

async function renderHistory(req, res) {
  const userId = req.session.user.id;
  const [bets] = await pool.query('SELECT * FROM bets WHERE user_id = ? ORDER BY bet_date DESC, created_at DESC', [userId]);
  return res.render('bets/history', { title: 'Bet History', bets });
}

async function renderEditBet(req, res) {
  const userId = req.session.user.id;
  const betId = req.params.id;

  const [bets] = await pool.query('SELECT * FROM bets WHERE id = ? AND user_id = ?', [betId, userId]);
  if (!bets.length) {
    req.session.messages = [{ type: 'error', text: 'Bet not found.' }];
    return res.redirect('/bets/history');
  }

  return res.render('bets/edit', { title: 'Edit Bet', bet: bets[0] });
}

async function updateBet(req, res) {
  const userId = req.session.user.id;
  const betId = req.params.id;
  const { sport, betType, market, odds, stake, result, betDate, notes } = req.body;

  const parsedOdds = Number(odds);
  const parsedStake = Number(stake);
  let profitLoss = 0;

  if (result === 'win') {
    if (parsedOdds > 0) {
      profitLoss = (parsedStake * parsedOdds) / 100;
    } else {
      profitLoss = (parsedStake * 100) / Math.abs(parsedOdds);
    }
  }

  if (result === 'loss') {
    profitLoss = -parsedStake;
  }

  await pool.query(
    `UPDATE bets
    SET sport = ?, bet_type = ?, market = ?, odds = ?, stake = ?, result = ?, profit_loss = ?, bet_date = ?, notes = ?
    WHERE id = ? AND user_id = ?`,
    [sport, betType, market, parsedOdds, parsedStake, result, profitLoss, betDate, notes || null, betId, userId]
  );

  req.session.messages = [{ type: 'success', text: 'Bet updated.' }];
  return res.redirect('/bets/history');
}

async function deleteBet(req, res) {
  const userId = req.session.user.id;
  const betId = req.params.id;

  await pool.query('DELETE FROM bets WHERE id = ? AND user_id = ?', [betId, userId]);

  req.session.messages = [{ type: 'success', text: 'Bet deleted.' }];
  return res.redirect('/bets/history');
}

module.exports = {
  renderAddBet,
  createBet,
  renderHistory,
  renderEditBet,
  updateBet,
  deleteBet,
};

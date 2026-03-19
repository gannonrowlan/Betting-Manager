const pool = require('../config/db');
const {
  calculateProfitLoss,
  calculateRoi,
  calculateWinRate,
  formatDateInput,
  parseDateInput,
  summarizeBets,
} = require('../services/statsService');

function toCsvCell(value) {
  const safeValue = value == null ? '' : String(value);
  return `"${safeValue.replace(/"/g, '""')}"`;
}

function formatDateForCsv(rawDate) {
  if (!rawDate) {
    return '';
  }

  return new Date(rawDate).toISOString().slice(0, 10);
}

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
  const profitLoss = calculateProfitLoss({ odds: parsedOdds, stake: parsedStake, result });

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

function buildHistoryFilters(query = {}) {
  const sport = (query.sport || '').trim();
  const result = (query.result || '').trim();
  const startDate = (query.startDate || '').trim();
  const endDate = (query.endDate || '').trim();

  return {
    sport,
    result,
    startDate,
    endDate,
    hasActiveFilters: Boolean(sport || result || startDate || endDate),
  };
}

async function renderHistory(req, res) {
  const userId = req.session.user.id;
  const filters = buildHistoryFilters(req.query);

  let historyQuery = 'SELECT * FROM bets WHERE user_id = ?';
  const queryParams = [userId];

  if (filters.sport) {
    historyQuery += ' AND sport = ?';
    queryParams.push(filters.sport);
  }

  if (filters.result) {
    historyQuery += ' AND result = ?';
    queryParams.push(filters.result);
  }

  if (filters.startDate) {
    historyQuery += ' AND bet_date >= ?';
    queryParams.push(filters.startDate);
  }

  if (filters.endDate) {
    historyQuery += ' AND bet_date <= ?';
    queryParams.push(filters.endDate);
  }

  historyQuery += ' ORDER BY bet_date DESC, created_at DESC';

  const [bets] = await pool.query(historyQuery, queryParams);
  const [sports] = await pool.query(
    'SELECT DISTINCT sport FROM bets WHERE user_id = ? ORDER BY sport ASC',
    [userId]
  );

  const summary = summarizeBets(bets);

  return res.render('bets/history', {
    title: 'Bet History',
    bets,
    sports: sports.map((row) => row.sport),
    filters,
    summary: {
      totalBets: summary.totalBets,
      totalStake: summary.totalStake.toFixed(2),
      netProfit: summary.netProfit.toFixed(2),
      winRate: calculateWinRate({ wins: summary.wins, losses: summary.losses }),
      roi: calculateRoi({ netProfit: summary.netProfit, totalStake: summary.totalStake }),
      wins: summary.wins,
      losses: summary.losses,
      pushes: summary.pushes,
      averageStake: summary.averageStake.toFixed(2),
    },
  });
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
  const profitLoss = calculateProfitLoss({ odds: parsedOdds, stake: parsedStake, result });

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

async function exportHistoryCsv(req, res) {
  const userId = req.session.user.id;
  const filters = buildHistoryFilters(req.query);
  let exportQuery = `SELECT bet_date, sport, bet_type, market, odds, stake, result, profit_loss, notes
      FROM bets
      WHERE user_id = ?`;
  const queryParams = [userId];

  if (filters.sport) {
    exportQuery += ' AND sport = ?';
    queryParams.push(filters.sport);
  }

  if (filters.result) {
    exportQuery += ' AND result = ?';
    queryParams.push(filters.result);
  }

  if (filters.startDate && parseDateInput(filters.startDate)) {
    exportQuery += ' AND bet_date >= ?';
    queryParams.push(formatDateInput(parseDateInput(filters.startDate)));
  }

  if (filters.endDate && parseDateInput(filters.endDate)) {
    exportQuery += ' AND bet_date <= ?';
    queryParams.push(formatDateInput(parseDateInput(filters.endDate)));
  }

  exportQuery += ' ORDER BY bet_date DESC, created_at DESC';

  const [bets] = await pool.query(exportQuery, queryParams);

  const headers = ['Bet Date', 'Sport', 'Bet Type', 'Market', 'Odds', 'Stake', 'Result', 'Profit/Loss', 'Notes'];
  const rows = bets.map((bet) => [
    formatDateForCsv(bet.bet_date),
    bet.sport,
    bet.bet_type,
    bet.market,
    bet.odds,
    Number(bet.stake || 0).toFixed(2),
    bet.result,
    Number(bet.profit_loss || 0).toFixed(2),
    bet.notes || '',
  ]);

  const csvLines = [headers, ...rows].map((row) => row.map(toCsvCell).join(','));
  const csvContent = csvLines.join('\n');

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="bet-history.csv"');
  return res.status(200).send(csvContent);
}

module.exports = {
  renderAddBet,
  createBet,
  renderHistory,
  renderEditBet,
  exportHistoryCsv,
  updateBet,
  deleteBet,
};

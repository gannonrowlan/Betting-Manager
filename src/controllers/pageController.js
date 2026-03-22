const pool = require('../config/db');
const {
  buildMonthlyRecap,
  formatDateInput,
  getDateRangePreset,
  groupPerformance,
  parseDateInput,
  summarizeBets,
} = require('../services/statsService');
const {
  createBankrollTransaction,
  deleteBankrollTransaction,
  getBankrollTransactions,
  getOrCreateProfile,
  updateProfile,
} = require('../services/profileService');

function renderLanding(req, res) {
  if (req.session.user) {
    return res.redirect('/dashboard');
  }

  return res.render('landing', { title: 'Bankroll IQ | Sports Betting Manager' });
}

function normalizeDashboardFilters(query = {}) {
  const range = (query.range || 'all').trim();
  const preset = getDateRangePreset(range);
  const rawStartDate = (query.startDate || '').trim();
  const rawEndDate = (query.endDate || '').trim();

  const startDate = range === 'custom' ? parseDateInput(rawStartDate) : preset.startDate;
  const endDate = range === 'custom' ? parseDateInput(rawEndDate) : preset.endDate;

  return {
    range,
    startDate,
    endDate,
    startDateValue: range === 'custom' ? rawStartDate : formatDateInput(preset.startDate),
    endDateValue: range === 'custom' ? rawEndDate : formatDateInput(preset.endDate),
    isCustom: range === 'custom',
    hasDateFilter: Boolean(startDate || endDate),
  };
}

function formatTrendLabel(filters) {
  if (!filters.hasDateFilter) {
    return 'All-time performance';
  }

  if (filters.startDate && filters.endDate) {
    return `${formatDateInput(filters.startDate)} to ${formatDateInput(filters.endDate)}`;
  }

  if (filters.startDate) {
    return `Since ${formatDateInput(filters.startDate)}`;
  }

  return `Through ${formatDateInput(filters.endDate)}`;
}

function getBestAndWorstGroup(groups = []) {
  if (!groups.length) {
    return {
      best: null,
      worst: null,
    };
  }

  const sortedByProfit = [...groups].sort((left, right) => right.netProfit - left.netProfit);
  return {
    best: sortedByProfit[0],
    worst: sortedByProfit[sortedByProfit.length - 1],
  };
}

function getTopGroup(groups = []) {
  return groups.length ? groups[0] : null;
}

function formatDashboardDate(date) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

function buildTrendSeries(bets = [], startingBankroll = 0) {
  if (!bets.length) {
    return [];
  }

  const sortedBets = [...bets].sort((left, right) => {
    const leftDate = new Date(left.bet_date || left.betDate);
    const rightDate = new Date(right.bet_date || right.betDate);
    return leftDate - rightDate;
  });

  let runningProfit = 0;

  return sortedBets.reduce((series, bet) => {
    const date = new Date(bet.bet_date || bet.betDate);
    if (Number.isNaN(date.getTime())) {
      return series;
    }

    const key = formatDateInput(date);
    const profitLoss = Number(bet.profit_loss || bet.profitLoss || 0);
    runningProfit += profitLoss;

    const point = {
      key,
      label: formatDashboardDate(date),
      dayProfit: profitLoss,
      netProfit: runningProfit,
      bankroll: startingBankroll + runningProfit,
    };

    const previousPoint = series[series.length - 1];
    if (previousPoint && previousPoint.key === key) {
      series[series.length - 1] = point;
      return series;
    }

    series.push(point);
    return series;
  }, []);
}

function getTrendInsights(trendSeries = []) {
  if (!trendSeries.length) {
    return {
      windowChange: null,
      bestDay: null,
      worstDay: null,
    };
  }

  const firstPoint = trendSeries[0];
  const lastPoint = trendSeries[trendSeries.length - 1];
  const sortedByChange = [...trendSeries].sort((left, right) => right.dayProfit - left.dayProfit);

  return {
    windowChange: {
      label: `${firstPoint.label} to ${lastPoint.label}`,
      bankroll: lastPoint.bankroll,
      netProfit: lastPoint.netProfit,
      dayProfit: lastPoint.netProfit - firstPoint.netProfit,
    },
    bestDay: sortedByChange[0],
    worstDay: sortedByChange[sortedByChange.length - 1],
  };
}

function formatCurrency(value = 0) {
  return Number(value || 0).toFixed(2);
}

function buildBankrollTransactionSummary(transactions = []) {
  return transactions.reduce(
    (summary, transaction) => {
      if (transaction.transactionType === 'deposit') {
        summary.deposits += transaction.amount;
      }

      if (transaction.transactionType === 'withdrawal') {
        summary.withdrawals += transaction.amount;
      }

      return summary;
    },
    {
      deposits: 0,
      withdrawals: 0,
    }
  );
}

function buildBankrollTimeline({ startingBankroll = 0, bets = [], transactions = [] }) {
  const events = [
    ...bets.map((bet) => ({
      date: formatDateInput(new Date(bet.bet_date || bet.betDate)),
      type: 'bet',
      amount: Number(bet.profit_loss || bet.profitLoss || 0),
    })),
    ...transactions.map((transaction) => ({
      date: formatDateInput(new Date(transaction.transactionDate)),
      type: transaction.transactionType,
      amount: transaction.transactionType === 'withdrawal' ? -Number(transaction.amount || 0) : Number(transaction.amount || 0),
    })),
  ]
    .filter((event) => event.date)
    .sort((left, right) => left.date.localeCompare(right.date));

  let runningBankroll = Number(startingBankroll || 0);

  return events.reduce((series, event) => {
    runningBankroll += event.amount;

    const point = {
      key: event.date,
      label: formatDashboardDate(new Date(`${event.date}T00:00:00Z`)),
      bankroll: runningBankroll,
      delta: event.amount,
      type: event.type,
    };

    const previousPoint = series[series.length - 1];
    if (previousPoint && previousPoint.key === event.date) {
      previousPoint.bankroll = point.bankroll;
      previousPoint.delta += event.amount;
      return series;
    }

    series.push(point);
    return series;
  }, []);
}

function calculateDrawdown(trendSeries = [], startingBankroll = 0) {
  let peak = Number(startingBankroll || 0);
  let maxDrawdown = 0;

  trendSeries.forEach((point) => {
    peak = Math.max(peak, point.bankroll);
    maxDrawdown = Math.max(maxDrawdown, peak - point.bankroll);
  });

  return maxDrawdown;
}

function buildUnitRecommendations({ currentBankroll = 0, profileUnitSize = 0, averageStake = 0 }) {
  const bankroll = Math.max(Number(currentBankroll || 0), 0);
  const profileUnit = Number(profileUnitSize || 0);
  const avgStake = Number(averageStake || 0);

  return [
    { label: '1% Unit', amount: bankroll * 0.01, note: 'Conservative bankroll management.' },
    { label: '2% Unit', amount: bankroll * 0.02, note: 'Balanced default for most users.' },
    { label: '3% Unit', amount: bankroll * 0.03, note: 'Higher variance, more aggressive.' },
    {
      label: 'Current Unit',
      amount: profileUnit,
      note: avgStake && profileUnit ? `Your average stake is ${(avgStake / profileUnit).toFixed(1)}u.` : 'No average stake yet.',
    },
  ];
}

async function getBetLegsByBetIds(userId, betIds = []) {
  if (!betIds.length) {
    return new Map();
  }

  const placeholders = betIds.map(() => '?').join(', ');
  const [rows] = await pool.query(
    `SELECT bet_legs.bet_id, bet_legs.sport, bet_legs.market, bet_legs.leg_order
      FROM bet_legs
      INNER JOIN bets ON bets.id = bet_legs.bet_id
      WHERE bets.user_id = ?
        AND bet_legs.bet_id IN (${placeholders})
      ORDER BY bet_legs.bet_id ASC, bet_legs.leg_order ASC`,
    [userId, ...betIds]
  );

  return rows.reduce((map, row) => {
    if (!map.has(row.bet_id)) {
      map.set(row.bet_id, []);
    }

    map.get(row.bet_id).push({
      sport: row.sport || '',
      market: row.market,
      legOrder: row.leg_order,
    });

    return map;
  }, new Map());
}

function hasMultipleSports(legs = []) {
  const sports = legs
    .map((leg) => String(leg.sport || '').trim().toLowerCase())
    .filter(Boolean);

  return new Set(sports).size > 1;
}

function summarizeLegs(legs = [], isMultiSport = false) {
  return legs
    .map((leg, index) => {
      const market = String(leg.market || '').trim();
      const sport = String(leg.sport || '').trim();

      if (!market) {
        return '';
      }

      if (isMultiSport && sport) {
        return `Leg ${index + 1}: ${sport} - ${market}`;
      }

      return `Leg ${index + 1}: ${market}`;
    })
    .filter(Boolean)
    .join(' | ');
}

async function renderDashboard(req, res) {
  const userId = req.session.user.id;
  const filters = normalizeDashboardFilters(req.query);
  const [allBets] = await pool.query(
    'SELECT * FROM bets WHERE user_id = ? ORDER BY bet_date DESC, created_at DESC',
    [userId]
  );

  const filteredBets = allBets.filter((bet) => {
    const betDate = new Date(bet.bet_date);
    if (Number.isNaN(betDate.getTime())) {
      return false;
    }

    if (filters.startDate && betDate < filters.startDate) {
      return false;
    }

    if (filters.endDate && betDate > filters.endDate) {
      return false;
    }

    return true;
  });

  const legsByBetId = await getBetLegsByBetIds(userId, filteredBets.map((bet) => bet.id));
  const hydratedBets = filteredBets.map((bet) => {
    const legs = legsByBetId.get(bet.id) || [];
    const isMultiSport = bet.sport === 'Multi-Sport' || hasMultipleSports(legs);

    return {
      ...bet,
      legs,
      displayMarket: legs.length ? summarizeLegs(legs, isMultiSport) : bet.market,
      isMultiSport,
    };
  });

  const recentBets = hydratedBets.slice(0, 5);
  const profile = await getOrCreateProfile(userId);
  const transactions = await getBankrollTransactions(userId);
  const transactionSummary = buildBankrollTransactionSummary(transactions);
  const stats = summarizeBets(filteredBets, profile.unitSize);
  const overallStats = summarizeBets(allBets, profile.unitSize);
  const currentBankroll = profile.startingBankroll + overallStats.netProfit + transactionSummary.deposits - transactionSummary.withdrawals;
  const bankrollRoi = profile.startingBankroll
    ? ((overallStats.netProfit / profile.startingBankroll) * 100).toFixed(1)
    : '0.0';

  let performanceMessage = 'Start logging bets to unlock your performance insights.';
  if (stats.totalBets > 0) {
    if (stats.netProfit > 0) {
      performanceMessage = `You are up $${stats.netProfit.toFixed(2)} in this window with a ${stats.roi}% ROI.`;
    } else if (stats.netProfit < 0) {
      performanceMessage = `You are down $${Math.abs(stats.netProfit).toFixed(2)} in this window. Audit sizing and recent bet selection.`;
    } else {
      performanceMessage = 'You are flat in this window. More volume will make the trend clearer.';
    }
  }

  const sportGroups = groupPerformance(filteredBets, 'sport', profile.unitSize);
  const sportsbookGroups = groupPerformance(
    filteredBets.filter((bet) => (bet.sportsbook || '').trim()),
    'sportsbook',
    profile.unitSize
  );
  const { best, worst } = getBestAndWorstGroup(sportGroups);
  const { best: bestSportsbook, worst: toughestSportsbook } = getBestAndWorstGroup(sportsbookGroups);
  const trendSeries = buildTrendSeries(filteredBets, profile.startingBankroll);
  const trendInsights = getTrendInsights(trendSeries);

  return res.render('dashboard', {
    title: 'Dashboard',
    filters,
    filterLabel: formatTrendLabel(filters),
    stats: {
      totalBets: stats.totalBets,
      wins: stats.wins,
      losses: stats.losses,
      pushes: stats.pushes,
      totalStake: stats.totalStake,
      netProfit: stats.netProfit,
      winRate: stats.winRate,
      roi: stats.roi,
      startingBankroll: profile.startingBankroll,
      currentBankroll,
      unitSize: profile.unitSize,
      bankrollRoi,
      averageStake: stats.averageStake,
      units: stats.units,
      biggestWin: stats.biggestWin,
      biggestLoss: stats.biggestLoss,
      currentStreak: stats.currentStreak,
    },
    highlights: {
      bestSport: best,
      toughestSport: worst,
      bestSportsbook,
      toughestSportsbook,
    },
    recentBets,
    trendSeries,
    trendInsights,
    performanceMessage,
  });
}

async function renderBankrollSettings(req, res) {
  const userId = req.session.user.id;
  const profile = await getOrCreateProfile(userId);
  const [bets] = await pool.query(
    'SELECT * FROM bets WHERE user_id = ? ORDER BY bet_date DESC, created_at DESC',
    [userId]
  );
  const transactions = await getBankrollTransactions(userId);
  const betSummary = summarizeBets(bets, profile.unitSize);
  const transactionSummary = buildBankrollTransactionSummary(transactions);
  const currentBankroll = profile.startingBankroll + betSummary.netProfit + transactionSummary.deposits - transactionSummary.withdrawals;
  const bankrollTimeline = buildBankrollTimeline({
    startingBankroll: profile.startingBankroll,
    bets,
    transactions,
  });
  const peakBankroll = bankrollTimeline.length
    ? Math.max(profile.startingBankroll, ...bankrollTimeline.map((point) => point.bankroll))
    : profile.startingBankroll;
  const lowBankroll = bankrollTimeline.length
    ? Math.min(profile.startingBankroll, ...bankrollTimeline.map((point) => point.bankroll))
    : profile.startingBankroll;
  const drawdown = calculateDrawdown(bankrollTimeline, profile.startingBankroll);
  const unitRecommendations = buildUnitRecommendations({
    currentBankroll,
    profileUnitSize: profile.unitSize,
    averageStake: betSummary.averageStake,
  });

  return res.render('settings/bankroll', {
    title: 'Bankroll Settings',
    profile,
    transactionForm: {
      transactionType: 'deposit',
      amount: '',
      transactionDate: formatDateInput(new Date()),
      notes: '',
    },
    transactions,
    summary: {
      startingBankroll: formatCurrency(profile.startingBankroll),
      currentBankroll: formatCurrency(currentBankroll),
      netProfit: formatCurrency(betSummary.netProfit),
      deposits: formatCurrency(transactionSummary.deposits),
      withdrawals: formatCurrency(transactionSummary.withdrawals),
      peakBankroll: formatCurrency(peakBankroll),
      lowBankroll: formatCurrency(lowBankroll),
      drawdown: formatCurrency(drawdown),
      averageStake: formatCurrency(betSummary.averageStake),
    },
    bankrollTimeline,
    unitRecommendations: unitRecommendations.map((recommendation) => ({
      ...recommendation,
      amount: formatCurrency(recommendation.amount),
    })),
  });
}

async function updateBankrollSettings(req, res) {
  const userId = req.session.user.id;
  const startingBankroll = Number(req.body.startingBankroll);
  const unitSize = Number(req.body.unitSize);

  if (!Number.isFinite(startingBankroll) || startingBankroll < 0) {
    req.session.messages = [{ type: 'error', text: 'Starting bankroll must be 0 or greater.' }];
    return res.redirect('/settings/bankroll');
  }

  if (!Number.isFinite(unitSize) || unitSize <= 0) {
    req.session.messages = [{ type: 'error', text: 'Unit size must be greater than 0.' }];
    return res.redirect('/settings/bankroll');
  }

  await updateProfile(userId, {
    startingBankroll: startingBankroll.toFixed(2),
    unitSize: unitSize.toFixed(2),
  });

  req.session.messages = [{ type: 'success', text: 'Bankroll settings updated.' }];
  return res.redirect('/settings/bankroll');
}

async function createBankrollAdjustment(req, res) {
  const userId = req.session.user.id;
  const transactionType = String(req.body.transactionType || '').trim();
  const amount = Number(req.body.amount);
  const transactionDate = String(req.body.transactionDate || '').trim();
  const notes = String(req.body.notes || '').trim();

  if (!['deposit', 'withdrawal'].includes(transactionType)) {
    req.session.messages = [{ type: 'error', text: 'Choose deposit or withdrawal.' }];
    return res.redirect('/settings/bankroll');
  }

  if (!Number.isFinite(amount) || amount <= 0) {
    req.session.messages = [{ type: 'error', text: 'Enter a valid adjustment amount greater than 0.' }];
    return res.redirect('/settings/bankroll');
  }

  if (!parseDateInput(transactionDate)) {
    req.session.messages = [{ type: 'error', text: 'Enter a valid transaction date.' }];
    return res.redirect('/settings/bankroll');
  }

  await createBankrollTransaction(userId, {
    transactionType,
    amount: amount.toFixed(2),
    transactionDate,
    notes,
  });

  req.session.messages = [{ type: 'success', text: 'Bankroll adjustment saved.' }];
  return res.redirect('/settings/bankroll');
}

async function removeBankrollAdjustment(req, res) {
  const userId = req.session.user.id;
  const transactionId = Number(req.params.id);

  if (!Number.isInteger(transactionId) || transactionId <= 0) {
    req.session.messages = [{ type: 'error', text: 'Invalid bankroll adjustment.' }];
    return res.redirect('/settings/bankroll');
  }

  await deleteBankrollTransaction(userId, transactionId);
  req.session.messages = [{ type: 'success', text: 'Bankroll adjustment removed.' }];
  return res.redirect('/settings/bankroll');
}

async function renderStats(req, res) {
  const userId = req.session.user.id;
  const profile = await getOrCreateProfile(userId);
  const [bets] = await pool.query(
    'SELECT * FROM bets WHERE user_id = ? ORDER BY bet_date DESC, created_at DESC',
    [userId]
  );

  const summary = summarizeBets(bets, profile.unitSize);
  const sportStats = groupPerformance(bets, 'sport', profile.unitSize);
  const sportsbookStats = groupPerformance(
    bets.filter((bet) => (bet.sportsbook || '').trim()),
    'sportsbook',
    profile.unitSize
  );
  const betTypeStats = groupPerformance(bets, 'bet_type', profile.unitSize).map((row) => ({
    ...row,
    betType: row.key,
  }));
  const monthlyRecap = buildMonthlyRecap(bets, profile.unitSize);
  const topSport = getTopGroup(sportStats);
  const topSportsbook = getTopGroup(sportsbookStats);
  const topBetType = getTopGroup(betTypeStats);

  return res.render('stats', {
    title: 'Stats',
    summary,
    sportStats,
    sportsbookStats,
    betTypeStats,
    monthlyRecap,
    highlights: {
      topSport,
      topSportsbook,
      topBetType,
    },
  });
}

module.exports = {
  createBankrollAdjustment,
  removeBankrollAdjustment,
  renderLanding,
  renderDashboard,
  renderStats,
  renderBankrollSettings,
  updateBankrollSettings,
};

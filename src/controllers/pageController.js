const pool = require('../config/db');
const {
  buildMonthlyRecap,
  formatDateInput,
  getDateRangePreset,
  groupPerformance,
  parseDateInput,
  summarizeBets,
} = require('../services/statsService');
const { getOrCreateProfile, updateProfile } = require('../services/profileService');

function renderLanding(req, res) {
  if (req.session.user) {
    return res.redirect('/dashboard');
  }

  return res.render('landing', { title: 'Bankroll IQ | Sports Betting Manager' });
}

function normalizeDashboardFilters(query = {}) {
  const range = (query.range || '30d').trim();
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

  const recentBets = filteredBets.slice(0, 5);
  const profile = await getOrCreateProfile(userId);
  const stats = summarizeBets(filteredBets, profile.unitSize);
  const overallStats = summarizeBets(allBets, profile.unitSize);
  const currentBankroll = profile.startingBankroll + overallStats.netProfit;
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
  const { best, worst } = getBestAndWorstGroup(sportGroups);
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

  return res.render('settings/bankroll', {
    title: 'Bankroll Settings',
    profile,
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

async function renderStats(req, res) {
  const userId = req.session.user.id;
  const profile = await getOrCreateProfile(userId);
  const [bets] = await pool.query(
    'SELECT * FROM bets WHERE user_id = ? ORDER BY bet_date DESC, created_at DESC',
    [userId]
  );

  const sportStats = groupPerformance(bets, 'sport', profile.unitSize);
  const betTypeStats = groupPerformance(bets, 'bet_type', profile.unitSize).map((row) => ({
    ...row,
    betType: row.key,
  }));
  const monthlyRecap = buildMonthlyRecap(bets, profile.unitSize);

  return res.render('stats', {
    title: 'Stats',
    sportStats,
    betTypeStats,
    monthlyRecap,
  });
}

module.exports = {
  renderLanding,
  renderDashboard,
  renderStats,
  renderBankrollSettings,
  updateBankrollSettings,
};

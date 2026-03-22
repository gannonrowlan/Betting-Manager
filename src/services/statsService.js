function calculateWinRate({ wins = 0, losses = 0 }) {
  const safeWins = Number(wins) || 0;
  const safeLosses = Number(losses) || 0;
  const decisions = safeWins + safeLosses;

  if (!decisions) {
    return '0.0';
  }

  return ((safeWins / decisions) * 100).toFixed(1);
}

function calculateRoi({ netProfit = 0, totalStake = 0 }) {
  const safeNetProfit = Number(netProfit) || 0;
  const safeTotalStake = Number(totalStake) || 0;

  if (!safeTotalStake) {
    return '0.0';
  }

  return ((safeNetProfit / safeTotalStake) * 100).toFixed(1);
}

function calculateProfitLoss({ odds = 0, stake = 0, result = 'push' }) {
  const parsedOdds = Number(odds);
  const parsedStake = Number(stake);

  if (!Number.isFinite(parsedOdds) || !Number.isFinite(parsedStake) || parsedStake <= 0) {
    return 0;
  }

  if (result === 'win') {
    if (parsedOdds > 0) {
      return (parsedStake * parsedOdds) / 100;
    }

    return (parsedStake * 100) / Math.abs(parsedOdds);
  }

  if (result === 'loss') {
    return -parsedStake;
  }

  return 0;
}

function parseDateInput(value) {
  if (!value) {
    return null;
  }

  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
}

function getDateRangePreset(range = 'all', today = new Date()) {
  const normalizedToday = new Date(today);
  normalizedToday.setUTCHours(0, 0, 0, 0);

  const endDate = new Date(normalizedToday);
  const startDate = new Date(normalizedToday);

  if (range === '7d') {
    startDate.setUTCDate(startDate.getUTCDate() - 6);
    return { startDate, endDate };
  }

  if (range === '30d') {
    startDate.setUTCDate(startDate.getUTCDate() - 29);
    return { startDate, endDate };
  }

  if (range === '90d') {
    startDate.setUTCDate(startDate.getUTCDate() - 89);
    return { startDate, endDate };
  }

  if (range === 'month') {
    startDate.setUTCDate(1);
    return { startDate, endDate };
  }

  if (range === 'year') {
    startDate.setUTCMonth(0, 1);
    return { startDate, endDate };
  }

  return { startDate: null, endDate: null };
}

function formatDateInput(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return '';
  }

  return date.toISOString().slice(0, 10);
}

function normalizeBetForSorting(bet) {
  const primaryDate = bet.bet_date || bet.betDate;
  const secondaryDate = bet.created_at || bet.createdAt || primaryDate;

  return {
    ...bet,
    __sortDate: new Date(primaryDate),
    __secondarySortDate: new Date(secondaryDate),
  };
}

function calculateCurrentStreak(bets = []) {
  const sortedBets = bets
    .map(normalizeBetForSorting)
    .sort((left, right) => {
      const primaryDifference = left.__sortDate - right.__sortDate;
      if (primaryDifference !== 0) {
        return primaryDifference;
      }

      return left.__secondarySortDate - right.__secondarySortDate;
    });

  let streakType = null;
  let streakCount = 0;

  for (let index = sortedBets.length - 1; index >= 0; index -= 1) {
    const result = sortedBets[index].result;

    if (!['win', 'loss', 'push'].includes(result)) {
      continue;
    }

    if (result === 'push') {
      if (!streakType) {
        continue;
      }

      break;
    }

    if (!streakType) {
      streakType = result;
      streakCount = 1;
      continue;
    }

    if (result === streakType) {
      streakCount += 1;
      continue;
    }

    break;
  }

  if (!streakType) {
    return { type: 'none', count: 0, label: 'No streak yet' };
  }

  const prefix = streakType === 'win' ? 'W' : 'L';
  return {
    type: streakType,
    count: streakCount,
    label: `${prefix}${streakCount}`,
  };
}

function summarizeBets(bets = [], unitSize = 0) {
  const summary = bets.reduce(
    (accumulator, bet) => {
      const stake = Number(bet.stake || 0);
      const profitLoss = Number(bet.profit_loss || bet.profitLoss || 0);
      const result = bet.result;

      return {
        totalBets: accumulator.totalBets + 1,
        wins: accumulator.wins + (result === 'win' ? 1 : 0),
        losses: accumulator.losses + (result === 'loss' ? 1 : 0),
        pushes: accumulator.pushes + (result === 'push' ? 1 : 0),
        totalStake: accumulator.totalStake + stake,
        netProfit: accumulator.netProfit + profitLoss,
        averageStake: accumulator.averageStake + stake,
        biggestWin: Math.max(accumulator.biggestWin, profitLoss),
        biggestLoss: Math.min(accumulator.biggestLoss, profitLoss),
      };
    },
    {
      totalBets: 0,
      wins: 0,
      losses: 0,
      pushes: 0,
      totalStake: 0,
      netProfit: 0,
      averageStake: 0,
      biggestWin: 0,
      biggestLoss: 0,
    }
  );

  const safeUnitSize = Number(unitSize) || 0;
  const averageStake = summary.totalBets ? summary.averageStake / summary.totalBets : 0;

  return {
    ...summary,
    averageStake,
    roi: calculateRoi(summary),
    winRate: calculateWinRate(summary),
    units: safeUnitSize ? (summary.netProfit / safeUnitSize).toFixed(1) : '0.0',
    currentStreak: calculateCurrentStreak(bets),
  };
}

function groupPerformance(rows = [], keyName, unitSize = 0) {
  const groups = new Map();

  rows.forEach((row) => {
    const key = row[keyName] || 'Uncategorized';
    if (!groups.has(key)) {
      groups.set(key, []);
    }

    groups.get(key).push(row);
  });

  return Array.from(groups.entries())
    .map(([key, bets]) => {
      const summary = summarizeBets(bets, unitSize);
      return {
        key,
        totalBets: summary.totalBets,
        wins: summary.wins,
        losses: summary.losses,
        pushes: summary.pushes,
        totalStake: summary.totalStake,
        netProfit: summary.netProfit,
        roi: summary.roi,
        winRate: summary.winRate,
        units: summary.units,
      };
    })
    .sort((left, right) => {
      if (right.totalBets !== left.totalBets) {
        return right.totalBets - left.totalBets;
      }

      return right.netProfit - left.netProfit;
    });
}

function buildMonthlyRecap(rows = [], unitSize = 0) {
  const months = new Map();

  rows.forEach((row) => {
    const date = new Date(row.bet_date || row.betDate);
    if (Number.isNaN(date.getTime())) {
      return;
    }

    const monthKey = date.toISOString().slice(0, 7);
    if (!months.has(monthKey)) {
      months.set(monthKey, []);
    }

    months.get(monthKey).push(row);
  });

  return Array.from(months.entries())
    .map(([month, bets]) => {
      const summary = summarizeBets(bets, unitSize);
      return {
        month,
        totalBets: summary.totalBets,
        netProfit: summary.netProfit,
        roi: summary.roi,
        winRate: summary.winRate,
        units: summary.units,
      };
    })
    .sort((left, right) => right.month.localeCompare(left.month));
}

module.exports = {
  buildMonthlyRecap,
  calculateCurrentStreak,
  calculateProfitLoss,
  calculateRoi,
  calculateWinRate,
  formatDateInput,
  getDateRangePreset,
  groupPerformance,
  parseDateInput,
  summarizeBets,
};

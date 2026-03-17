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

module.exports = {
  calculateWinRate,
  calculateRoi,
};
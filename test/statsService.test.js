const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildMonthlyRecap,
  calculateCurrentStreak,
  calculateProfitLoss,
  formatDateInput,
  getDateRangePreset,
  groupPerformance,
  summarizeBets,
} = require('../src/services/statsService');

test('calculateProfitLoss handles wins, losses, and pushes', () => {
  assert.equal(calculateProfitLoss({ odds: 150, stake: 20, result: 'win' }), 30);
  assert.equal(Number(calculateProfitLoss({ odds: -120, stake: 24, result: 'win' }).toFixed(2)), 20);
  assert.equal(calculateProfitLoss({ odds: 110, stake: 25, result: 'loss' }), -25);
  assert.equal(calculateProfitLoss({ odds: 110, stake: 25, result: 'push' }), 0);
});

test('summarizeBets computes rollup metrics and units', () => {
  const bets = [
    { stake: 20, profit_loss: 18, result: 'win', bet_date: '2026-03-01', created_at: '2026-03-01T12:00:00Z' },
    { stake: 25, profit_loss: -25, result: 'loss', bet_date: '2026-03-02', created_at: '2026-03-02T12:00:00Z' },
    { stake: 10, profit_loss: 0, result: 'push', bet_date: '2026-03-03', created_at: '2026-03-03T12:00:00Z' },
    { stake: 30, profit_loss: 27, result: 'win', bet_date: '2026-03-04', created_at: '2026-03-04T12:00:00Z' },
  ];

  const summary = summarizeBets(bets, 10);

  assert.equal(summary.totalBets, 4);
  assert.equal(summary.wins, 2);
  assert.equal(summary.losses, 1);
  assert.equal(summary.pushes, 1);
  assert.equal(summary.netProfit, 20);
  assert.equal(summary.averageStake, 21.25);
  assert.equal(summary.roi, '23.5');
  assert.equal(summary.winRate, '66.7');
  assert.equal(summary.units, '2.0');
  assert.equal(summary.currentStreak.label, 'W1');
});

test('calculateCurrentStreak skips trailing pushes and returns losing streaks', () => {
  const bets = [
    { result: 'win', bet_date: '2026-03-01', created_at: '2026-03-01T12:00:00Z' },
    { result: 'loss', bet_date: '2026-03-02', created_at: '2026-03-02T12:00:00Z' },
    { result: 'loss', bet_date: '2026-03-03', created_at: '2026-03-03T12:00:00Z' },
    { result: 'push', bet_date: '2026-03-04', created_at: '2026-03-04T12:00:00Z' },
  ];

  assert.deepEqual(calculateCurrentStreak(bets), {
    type: 'loss',
    count: 2,
    label: 'L2',
  });
});

test('groupPerformance and monthly recap create sorted analytics views', () => {
  const bets = [
    { sport: 'NBA', bet_type: 'Spread', stake: 20, profit_loss: 18, result: 'win', bet_date: '2026-03-10', created_at: '2026-03-10T12:00:00Z' },
    { sport: 'NBA', bet_type: 'Total', stake: 15, profit_loss: -15, result: 'loss', bet_date: '2026-03-11', created_at: '2026-03-11T12:00:00Z' },
    { sport: 'NHL', bet_type: 'Moneyline', stake: 10, profit_loss: 12, result: 'win', bet_date: '2026-02-15', created_at: '2026-02-15T12:00:00Z' },
  ];

  const grouped = groupPerformance(bets, 'sport', 10);
  const recap = buildMonthlyRecap(bets, 10);

  assert.equal(grouped[0].key, 'NBA');
  assert.equal(grouped[0].roi, '8.6');
  assert.equal(grouped[1].key, 'NHL');
  assert.equal(recap[0].month, '2026-03');
  assert.equal(recap[0].netProfit, 3);
  assert.equal(recap[1].month, '2026-02');
});

test('getDateRangePreset and formatDateInput produce stable dashboard ranges', () => {
  const { startDate, endDate } = getDateRangePreset('7d', new Date('2026-03-18T09:00:00Z'));

  assert.equal(formatDateInput(startDate), '2026-03-12');
  assert.equal(formatDateInput(endDate), '2026-03-18');
});
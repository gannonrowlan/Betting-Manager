const test = require('node:test');
const assert = require('node:assert/strict');

const { parseCsv, parseImportRows } = require('../src/services/importService');

test('parseCsv handles quoted commas and multiple rows', () => {
  const rows = parseCsv('Bet Date,Sport,Notes\n2026-03-22,NBA,"Late swap, great number"\n2026-03-23,NHL,Simple');

  assert.equal(rows.length, 3);
  assert.equal(rows[1][2], 'Late swap, great number');
});

test('parseImportRows normalizes export-style headers into bet records', () => {
  const { records, errors } = parseImportRows(
    'Bet Date,Sport,Sportsbook,Bet Type,Leg Count,Market,Odds,Stake,Result,Notes\n' +
    '2026-03-22,NBA,FanDuel,Spread,,Lakers -4.5,-110,22,win,Late edge'
  );

  assert.deepEqual(errors, []);
  assert.equal(records.length, 1);
  assert.equal(records[0].sport, 'NBA');
  assert.equal(records[0].betType, 'Spread');
  assert.equal(records[0].odds, -110);
  assert.equal(records[0].stake, 22);
  assert.equal(records[0].profitLoss > 0, true);
});

test('parseImportRows returns row errors for invalid data', () => {
  const { records, errors } = parseImportRows(
    'Date,Sport,Type,Market,Odds,Stake,Result\n' +
    'bad-date,NBA,Spread,Lakers -4.5,-110,22,win'
  );

  assert.equal(records.length, 0);
  assert.match(errors[0], /Row 2: bet date must be a valid YYYY-MM-DD value/);
});

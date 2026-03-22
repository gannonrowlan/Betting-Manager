const { calculateProfitLoss } = require('./statsService');

const HEADER_ALIASES = {
  betdate: 'betDate',
  date: 'betDate',
  sport: 'sport',
  sportsbook: 'sportsbook',
  book: 'sportsbook',
  bettype: 'betType',
  type: 'betType',
  legcount: 'legCount',
  market: 'market',
  odds: 'odds',
  stake: 'stake',
  result: 'result',
  notes: 'notes',
};

function normalizeHeader(header = '') {
  return String(header || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

function parseCsv(text = '') {
  const rows = [];
  let currentRow = [];
  let currentValue = '';
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    const nextCharacter = text[index + 1];

    if (character === '"') {
      if (inQuotes && nextCharacter === '"') {
        currentValue += '"';
        index += 1;
        continue;
      }

      inQuotes = !inQuotes;
      continue;
    }

    if (character === ',' && !inQuotes) {
      currentRow.push(currentValue);
      currentValue = '';
      continue;
    }

    if ((character === '\n' || character === '\r') && !inQuotes) {
      if (character === '\r' && nextCharacter === '\n') {
        index += 1;
      }

      currentRow.push(currentValue);
      currentValue = '';

      if (currentRow.some((value) => value !== '')) {
        rows.push(currentRow);
      }

      currentRow = [];
      continue;
    }

    currentValue += character;
  }

  currentRow.push(currentValue);
  if (currentRow.some((value) => value !== '')) {
    rows.push(currentRow);
  }

  return rows;
}

function buildHeaderMap(headers = []) {
  return headers.reduce((map, header, index) => {
    const normalized = normalizeHeader(header);
    const key = HEADER_ALIASES[normalized];

    if (key && map[key] == null) {
      map[key] = index;
    }

    return map;
  }, {});
}

function parseOdds(rawValue) {
  const normalized = String(rawValue || '').trim().replace(/^\+/, '');
  const parsed = Number(normalized);
  return Number.isInteger(parsed) && parsed !== 0 ? parsed : null;
}

function parseStake(rawValue) {
  const parsed = Number(String(rawValue || '').trim());
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function parseLegCount(rawValue) {
  const normalized = String(rawValue || '').trim();
  if (!normalized) {
    return null;
  }

  const parsed = Number.parseInt(normalized, 10);
  return Number.isInteger(parsed) && parsed > 1 ? parsed : null;
}

function parseImportRows(text = '') {
  const rows = parseCsv(text);

  if (!rows.length) {
    return { records: [], errors: ['CSV is empty.'] };
  }

  const [headerRow, ...dataRows] = rows;
  const headerMap = buildHeaderMap(headerRow);
  const requiredKeys = ['betDate', 'sport', 'betType', 'market', 'odds', 'stake', 'result'];
  const missingHeaders = requiredKeys.filter((key) => headerMap[key] == null);

  if (missingHeaders.length) {
    return {
      records: [],
      errors: [`Missing required columns: ${missingHeaders.join(', ')}.`],
    };
  }

  const records = [];
  const errors = [];

  dataRows.forEach((row, rowIndex) => {
    const lineNumber = rowIndex + 2;
    const record = {
      betDate: String(row[headerMap.betDate] || '').trim(),
      sport: String(row[headerMap.sport] || '').trim(),
      sportsbook: String(row[headerMap.sportsbook] || '').trim(),
      betType: String(row[headerMap.betType] || '').trim(),
      market: String(row[headerMap.market] || '').trim(),
      odds: parseOdds(row[headerMap.odds]),
      stake: parseStake(row[headerMap.stake]),
      result: String(row[headerMap.result] || '').trim().toLowerCase(),
      notes: String(row[headerMap.notes] || '').trim(),
      legCount: parseLegCount(row[headerMap.legCount]),
    };

    if (!record.betDate || Number.isNaN(new Date(`${record.betDate}T00:00:00Z`).getTime())) {
      errors.push(`Row ${lineNumber}: bet date must be a valid YYYY-MM-DD value.`);
      return;
    }

    if (!record.sport) {
      errors.push(`Row ${lineNumber}: sport is required.`);
      return;
    }

    if (!record.betType) {
      errors.push(`Row ${lineNumber}: bet type is required.`);
      return;
    }

    if (!record.market) {
      errors.push(`Row ${lineNumber}: market is required.`);
      return;
    }

    if (record.odds == null) {
      errors.push(`Row ${lineNumber}: odds must be a non-zero integer like -110 or +150.`);
      return;
    }

    if (record.stake == null) {
      errors.push(`Row ${lineNumber}: stake must be greater than 0.`);
      return;
    }

    if (!['win', 'loss', 'push'].includes(record.result)) {
      errors.push(`Row ${lineNumber}: result must be win, loss, or push.`);
      return;
    }

    records.push({
      ...record,
      profitLoss: calculateProfitLoss({
        odds: record.odds,
        stake: record.stake,
        result: record.result,
      }),
    });
  });

  return { records, errors };
}

module.exports = {
  buildHeaderMap,
  parseCsv,
  parseImportRows,
};

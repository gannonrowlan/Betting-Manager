function escapeCsvValue(value) {
  if (value == null) {
    return '';
  }

  const stringValue = String(value);
  if (/[",\r\n]/.test(stringValue)) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }

  return stringValue;
}

function buildCsv(columns = [], rows = []) {
  const header = columns.map((column) => escapeCsvValue(column.header)).join(',');
  const body = rows.map((row) => columns.map((column) => escapeCsvValue(row[column.key])).join(','));

  return [header, ...body].join('\r\n');
}

module.exports = {
  buildCsv,
  escapeCsvValue,
};

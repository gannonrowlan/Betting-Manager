const fs = require('fs');
const path = require('path');

const pool = require('../config/db');

let schemaReady = null;

function loadSchemaStatements() {
  const schemaPath = path.join(__dirname, '..', 'config', 'schema.sql');
  const raw = fs.readFileSync(schemaPath, 'utf8');

  return raw
    .split(/;\s*(?:\r?\n|$)/)
    .map((statement) => statement.trim())
    .filter(Boolean)
    .filter((statement) => !/^CREATE DATABASE\b/i.test(statement))
    .filter((statement) => !/^USE\b/i.test(statement));
}

async function ensureColumn({ tableName, columnName, alterSql }) {
  const [rows] = await pool.query(
    `SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
        AND COLUMN_NAME = ?`,
    [tableName, columnName]
  );

  if (!rows.length) {
    await pool.query(alterSql);
  }
}

function ensureAppSchema() {
  if (schemaReady) {
    return schemaReady;
  }

  schemaReady = (async () => {
    const statements = loadSchemaStatements();

    for (const statement of statements) {
      await pool.query(statement);
    }

    await ensureColumn({
      tableName: 'bankroll_profiles',
      columnName: 'add_bet_tips_dismissed',
      alterSql: 'ALTER TABLE bankroll_profiles ADD COLUMN add_bet_tips_dismissed TINYINT(1) NOT NULL DEFAULT 0',
    });
  })();

  return schemaReady;
}

module.exports = {
  ensureAppSchema,
  ensureColumn,
  loadSchemaStatements,
};

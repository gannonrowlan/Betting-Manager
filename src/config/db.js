const mysql = require('mysql2/promise');
require('dotenv').config();

function buildSslConfig() {
  const raw = String(process.env.DB_SSL || '').trim().toLowerCase();

  if (!raw || ['0', 'false', 'off', 'no'].includes(raw)) {
    return undefined;
  }

  return {
    rejectUnauthorized: false,
  };
}

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'betting_manager',
  port: Number(process.env.DB_PORT || 3306),
  ssl: buildSslConfig(),
  waitForConnections: true,
  connectionLimit: Number(process.env.DB_CONNECTION_LIMIT || 10),
  queueLimit: 0,
});

module.exports = pool;

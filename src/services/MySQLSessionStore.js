const session = require('express-session');

const DEFAULT_SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 14;

class MySQLSessionStore extends session.Store {
  constructor({ pool, tableName = 'app_sessions' }) {
    super();
    this.pool = pool;
    this.tableName = tableName;
    this.ready = this.ensureTable();
  }

  async ensureTable() {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS ${this.tableName} (
        sid VARCHAR(128) PRIMARY KEY,
        sess LONGTEXT NOT NULL,
        expires DATETIME NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);
  }

  getExpirationDate(sess = {}) {
    if (sess.cookie?.expires) {
      return new Date(sess.cookie.expires);
    }

    if (sess.cookie?.maxAge) {
      return new Date(Date.now() + Number(sess.cookie.maxAge));
    }

    return new Date(Date.now() + DEFAULT_SESSION_TTL_MS);
  }

  get(sid, callback) {
    this.ready
      .then(async () => {
        const [rows] = await this.pool.query(
          `SELECT sess, expires
            FROM ${this.tableName}
            WHERE sid = ?
            LIMIT 1`,
          [sid]
        );

        if (!rows.length) {
          callback(null, null);
          return;
        }

        const record = rows[0];
        const expiresAt = new Date(record.expires);

        if (Number.isNaN(expiresAt.getTime()) || expiresAt <= new Date()) {
          await this.pool.query(`DELETE FROM ${this.tableName} WHERE sid = ?`, [sid]);
          callback(null, null);
          return;
        }

        callback(null, JSON.parse(record.sess));
      })
      .catch((error) => callback(error));
  }

  set(sid, sess, callback) {
    this.ready
      .then(async () => {
        const expires = this.getExpirationDate(sess);
        const serialized = JSON.stringify(sess);

        await this.pool.query(
          `INSERT INTO ${this.tableName} (sid, sess, expires)
            VALUES (?, ?, ?)
            ON DUPLICATE KEY UPDATE
              sess = VALUES(sess),
              expires = VALUES(expires),
              updated_at = CURRENT_TIMESTAMP`,
          [sid, serialized, expires]
        );

        callback?.(null);
      })
      .catch((error) => callback?.(error));
  }

  destroy(sid, callback) {
    this.ready
      .then(async () => {
        await this.pool.query(`DELETE FROM ${this.tableName} WHERE sid = ?`, [sid]);
        callback?.(null);
      })
      .catch((error) => callback?.(error));
  }

  touch(sid, sess, callback) {
    this.ready
      .then(async () => {
        const expires = this.getExpirationDate(sess);
        await this.pool.query(
          `UPDATE ${this.tableName}
            SET expires = ?, updated_at = CURRENT_TIMESTAMP
            WHERE sid = ?`,
          [expires, sid]
        );

        callback?.(null);
      })
      .catch((error) => callback?.(error));
  }
}

module.exports = MySQLSessionStore;

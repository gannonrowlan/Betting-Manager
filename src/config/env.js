function parseBoolean(value, defaultValue = false) {
  if (value == null || value === '') {
    return defaultValue;
  }

  const normalized = String(value).trim().toLowerCase();
  return ['1', 'true', 'yes', 'on'].includes(normalized);
}

function validateEnvironment() {
  const nodeEnv = process.env.NODE_ENV || 'development';
  const isProduction = nodeEnv === 'production';
  const requiredInProduction = ['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME', 'SESSION_SECRET'];

  if (!isProduction) {
    return {
      nodeEnv,
      isProduction,
      trustProxy: parseBoolean(process.env.TRUST_PROXY, false),
    };
  }

  const missing = requiredInProduction.filter((key) => !String(process.env[key] || '').trim());

  if (missing.length) {
    throw new Error(`Missing required environment variables for production: ${missing.join(', ')}`);
  }

  if (process.env.SESSION_SECRET === 'dev-session-secret') {
    throw new Error('SESSION_SECRET must not use the development fallback in production.');
  }

  return {
    nodeEnv,
    isProduction,
    trustProxy: parseBoolean(process.env.TRUST_PROXY, true),
  };
}

module.exports = {
  parseBoolean,
  validateEnvironment,
};

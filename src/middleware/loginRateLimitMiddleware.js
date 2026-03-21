const WINDOW_MS = 1000 * 60 * 15;
const MAX_ATTEMPTS = 5;

const attemptsByKey = new Map();

function getClientIp(req) {
  const forwardedFor = req.headers['x-forwarded-for'];
  if (typeof forwardedFor === 'string' && forwardedFor.length) {
    return forwardedFor.split(',')[0].trim();
  }

  return req.ip || req.socket?.remoteAddress || 'unknown';
}

function buildRateLimitKey(req) {
  const email = (req.body?.email || '').trim().toLowerCase();
  return `${getClientIp(req)}:${email}`;
}

function clearExpiredAttempts(now) {
  attemptsByKey.forEach((entry, key) => {
    if (entry.expiresAt <= now) {
      attemptsByKey.delete(key);
    }
  });
}

function recordFailedLogin(req) {
  const now = Date.now();
  const key = buildRateLimitKey(req);
  const existing = attemptsByKey.get(key);

  if (!existing || existing.expiresAt <= now) {
    attemptsByKey.set(key, { count: 1, expiresAt: now + WINDOW_MS });
    return;
  }

  existing.count += 1;
}

function clearFailedLogins(req) {
  attemptsByKey.delete(buildRateLimitKey(req));
}

function loginRateLimit(req, res, next) {
  const now = Date.now();
  clearExpiredAttempts(now);

  const key = buildRateLimitKey(req);
  const existing = attemptsByKey.get(key);

  if (existing && existing.count >= MAX_ATTEMPTS && existing.expiresAt > now) {
    req.session.formData = {
      email: (req.body?.email || '').trim().toLowerCase(),
      rememberMe: req.body?.rememberMe === 'on',
    };
    req.session.messages = [{ type: 'error', text: 'Too many login attempts. Please try again in 15 minutes.' }];
    return res.redirect('/auth/login');
  }

  next();
}

module.exports = {
  loginRateLimit,
  recordFailedLogin,
  clearFailedLogins,
};

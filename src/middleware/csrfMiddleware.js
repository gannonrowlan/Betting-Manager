const crypto = require('crypto');

function ensureCsrfToken(req, res, next) {
  if (!req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(32).toString('hex');
  }

  res.locals.csrfToken = req.session.csrfToken;
  next();
}

function validateCsrfToken(req, res, next) {
  const sessionToken = req.session.csrfToken;
  const formToken = req.body?._csrf;

  if (!sessionToken || !formToken || sessionToken !== formToken) {
    req.session.messages = [{ type: 'error', text: 'Your session expired. Please try again.' }];
    return res.redirect('back');
  }

  next();
}

module.exports = {
  ensureCsrfToken,
  validateCsrfToken,
};

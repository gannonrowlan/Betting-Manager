function requireAuth(req, res, next) {
  if (!req.session.user) {
    req.session.messages = [{ type: 'error', text: 'Please log in to continue.' }];
    return res.redirect('/auth/login');
  }
  return next();
}

module.exports = { requireAuth };
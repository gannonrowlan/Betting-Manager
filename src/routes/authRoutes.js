const express = require('express');
const authController = require('../controllers/authController');
const csrfMiddleware = require('../middleware/csrfMiddleware');
const loginRateLimitMiddleware = require('../middleware/loginRateLimitMiddleware');

const router = express.Router();

router.get('/register', csrfMiddleware.ensureCsrfToken, authController.renderRegister);
router.post('/register', csrfMiddleware.validateCsrfToken, authController.register);
router.get('/login', csrfMiddleware.ensureCsrfToken, authController.renderLogin);
router.post('/login', csrfMiddleware.validateCsrfToken, loginRateLimitMiddleware.loginRateLimit, authController.login);
router.post('/logout', authController.logout);

module.exports = router;

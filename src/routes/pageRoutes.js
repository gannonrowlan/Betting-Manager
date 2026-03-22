const express = require('express');
const pageController = require('../controllers/pageController');
const authController = require('../controllers/authController');
const { requireAuth } = require('../middleware/authMiddleware');
const csrfMiddleware = require('../middleware/csrfMiddleware');

const router = express.Router();

router.get('/', pageController.renderLanding);
router.get('/dashboard', requireAuth, pageController.renderDashboard);
router.get('/stats', requireAuth, pageController.renderStats);
router.get('/settings/account', requireAuth, csrfMiddleware.ensureCsrfToken, authController.renderAccount);
router.post('/settings/account', requireAuth, csrfMiddleware.validateCsrfToken, authController.updateAccount);
router.get('/settings/bankroll', requireAuth, pageController.renderBankrollSettings);
router.post('/settings/bankroll', requireAuth, pageController.updateBankrollSettings);
router.post('/settings/bankroll/transactions', requireAuth, pageController.createBankrollAdjustment);
router.post('/settings/bankroll/transactions/:id/delete', requireAuth, pageController.removeBankrollAdjustment);

module.exports = router;

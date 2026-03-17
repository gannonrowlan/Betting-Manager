const express = require('express');
const pageController = require('../controllers/pageController');
const { requireAuth } = require('../middleware/authMiddleware');

const router = express.Router();

router.get('/', pageController.renderLanding);
router.get('/dashboard', requireAuth, pageController.renderDashboard);
router.get('/stats', requireAuth, pageController.renderStats);
router.get('/settings/bankroll', requireAuth, pageController.renderBankrollSettings);
router.post('/settings/bankroll', requireAuth, pageController.updateBankrollSettings);

module.exports = router;
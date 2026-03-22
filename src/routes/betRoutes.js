const express = require('express');
const betController = require('../controllers/betController');
const { requireAuth } = require('../middleware/authMiddleware');

const router = express.Router();

router.get('/new', requireAuth, betController.renderAddBet);
router.post('/new', requireAuth, betController.createBet);
router.post('/new/tips-dismiss', requireAuth, betController.dismissAddBetTipsPrompt);
router.get('/history', requireAuth, betController.renderHistory);
router.post('/history/delete', requireAuth, betController.deleteSelectedBets);
router.get('/:id/edit', requireAuth, betController.renderEditBet);
router.post('/:id/edit', requireAuth, betController.updateBet);
router.post('/:id/delete', requireAuth, betController.deleteBet);

module.exports = router;

const express = require('express');
const betController = require('../controllers/betController');
const { requireAuth } = require('../middleware/authMiddleware');

const router = express.Router();

router.get('/new', requireAuth, betController.renderAddBet);
router.post('/new', requireAuth, betController.createBet);
router.post('/new/tips-dismiss', requireAuth, betController.dismissAddBetTipsPrompt);
router.get('/history', requireAuth, betController.renderHistory);
router.get('/history/export', requireAuth, betController.exportHistoryCsv);
router.get('/:id/edit', requireAuth, betController.renderEditBet);
router.post('/:id/edit', requireAuth, betController.updateBet);
router.post('/:id/delete', requireAuth, betController.deleteBet);

module.exports = router;

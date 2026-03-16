const express = require('express');
const authController = require('../controllers/authController');

const router = express.Router();

router.get('/register', authController.renderRegister);
router.post('/register', authController.register);
router.get('/login', authController.renderLogin);
router.post('/login', authController.login);
router.post('/logout', authController.logout);

module.exports = router;
const express = require('express');
const router = express.Router();
const { signup, login, getMe } = require('../controllers/authController');
const { validateSignup, validateLogin } = require('../middleware/validate');
const { authLimiter } = require('../middleware/rateLimiter');
const { requireAuth } = require('../middleware/auth');

router.post('/signup', authLimiter, validateSignup, signup);
router.post('/login', authLimiter, validateLogin, login);
router.get('/me', requireAuth, getMe);

module.exports = router;

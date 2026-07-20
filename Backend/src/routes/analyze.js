const express = require('express');
const router = express.Router();
const { analyze, analyzePage, extractClaim } = require('../controllers/analyzeController');
const { validateAnalyze } = require('../middleware/validate');
const { analyzeLimiter } = require('../middleware/rateLimiter');
const { optionalAuth } = require('../middleware/auth');
const upload = require('../middleware/upload');

// Optional auth so logged-in users get their analysis saved to history
router.post('/', analyzeLimiter, optionalAuth, upload.single('file'), validateAnalyze, analyze);
router.post('/page', analyzeLimiter, optionalAuth, analyzePage);
router.post('/page/extract', analyzeLimiter, optionalAuth, extractClaim);

module.exports = router;

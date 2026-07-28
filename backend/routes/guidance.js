const express = require('express');
const router = express.Router();
const guidanceController = require('../controllers/guidanceController');
const requireAuth = require('../middleware/requireAuth');

router.post('/structure-advice', requireAuth, guidanceController.getAdvice);

module.exports = router;

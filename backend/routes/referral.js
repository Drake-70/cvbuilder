const express = require('express');
const router = express.Router();
const referralController = require('../controllers/referralController');
const requireAuth = require('../middleware/requireAuth');

router.get('/stats', requireAuth, referralController.getStats);
router.post('/apply', requireAuth, referralController.applyCode);

module.exports = router;

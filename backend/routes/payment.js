const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/paymentController');
const requireAuth = require('../middleware/requireAuth');
const { cacheMiddleware } = require('../middleware/cache');

router.get('/pricing', cacheMiddleware(300), paymentController.getPricing);
router.post('/initiate', requireAuth, paymentController.initiate);
router.get('/status/{referenceId}', requireAuth, paymentController.status);
router.post('/webhook', paymentController.webhook);

module.exports = router;

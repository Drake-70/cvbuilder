const express = require('express');
const router = express.Router();
const ocrController = require('../controllers/ocrController');
const requireAuth = require('../middleware/requireAuth');

router.post('/extract', requireAuth, ocrController.uploadMiddleware, ocrController.extractFromImage);

module.exports = router;

const express = require('express');
const router = express.Router();
const previewController = require('../controllers/previewController');

router.post('/ats', previewController.atsPreview);

module.exports = router;

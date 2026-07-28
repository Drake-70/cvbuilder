const express = require('express');
const router = express.Router();
const interviewController = require('../controllers/interviewController');
const requireAuth = require('../middleware/requireAuth');

router.post('/', requireAuth, interviewController.generate);

module.exports = router;

const express = require('express');
const router = express.Router();
const linkedinController = require('../controllers/linkedinController');
const requireAuth = require('../middleware/requireAuth');

router.post('/', requireAuth, linkedinController.generate);

module.exports = router;

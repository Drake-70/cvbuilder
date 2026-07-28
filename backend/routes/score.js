const express = require('express');
const router = express.Router();
const scoreController = require('../controllers/scoreController');
const requireAuth = require('../middleware/requireAuth');

router.post('/', requireAuth, scoreController.getScore);

module.exports = router;

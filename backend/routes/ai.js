const express = require('express');
const router = express.Router();
const aiController = require('../controllers/aiController');
const requireAuth = require('../middleware/requireAuth');

router.post('/grammar', requireAuth, aiController.checkGrammar);

module.exports = router;

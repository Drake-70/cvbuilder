const express = require('express');
const router = express.Router();
const tailorController = require('../controllers/tailorController');
const requireAuth = require('../middleware/requireAuth');

router.post('/', requireAuth, tailorController.tailor);

module.exports = router;

const express = require('express');
const router = express.Router();
const contactController = require('../controllers/contactController');
const requireAuth = require('../middleware/requireAuth');

router.post('/', contactController.submit);

module.exports = router;

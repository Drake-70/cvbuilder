const express = require('express');
const router = express.Router();
const apiKeyController = require('../controllers/apiKeyController');
const requireAuth = require('../middleware/requireAuth');

// Cookie-authenticated, because these are the user's own credentials and the user is
// a browser sitting in their own session. The keys they mint are then used from
// somewhere that is not a browser.
router.post('/', requireAuth, apiKeyController.create);
router.get('/', requireAuth, apiKeyController.list);
router.delete('/:id', requireAuth, apiKeyController.revoke);

module.exports = router;

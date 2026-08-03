const express = require('express');
const router = express.Router();
const draftController = require('../controllers/draftController');
const requireAuth = require('../middleware/requireAuth');

router.get('/', requireAuth, draftController.getDraft);
router.put('/', requireAuth, draftController.saveDraft);
router.delete('/', requireAuth, draftController.clearDraft);

module.exports = router;

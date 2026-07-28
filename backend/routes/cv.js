const express = require('express');
const router = express.Router();
const cvController = require('../controllers/cvController');
const requireAuth = require('../middleware/requireAuth');

router.post('/upload', requireAuth, cvController.uploadMiddleware, cvController.uploadCV);
router.post('/paste', requireAuth, cvController.pasteCV);
router.post('/build', requireAuth, cvController.buildFromScratch);
router.post('/expand-bullets', requireAuth, cvController.expandBullets);

router.post('/save', requireAuth, cvController.save);
router.get('/list', requireAuth, cvController.list);
router.get('/skills', cvController.getSkillSuggestions);
router.get('/:id', requireAuth, cvController.getById);
router.delete('/:id', requireAuth, cvController.deleteCV);

module.exports = router;

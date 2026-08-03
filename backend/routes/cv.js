const express = require('express');
const router = express.Router();
const cvController = require('../controllers/cvController');
const requireAuth = require('../middleware/requireAuth');
const { cacheMiddleware, invalidateCache } = require('../middleware/cache');

const invalidateCvList = (req, res, next) => {
  res.on('finish', () => invalidateCache(`/api/cv/list:${req.user?._id}`));
  next();
};

router.post('/upload', requireAuth, cvController.uploadMiddleware, cvController.uploadCV);
router.post('/paste', requireAuth, cvController.pasteCV);
router.post('/build', requireAuth, cvController.buildFromScratch);
router.post('/expand-bullets', requireAuth, cvController.expandBullets);

router.post('/save', requireAuth, invalidateCvList, cvController.save);
router.get('/list', requireAuth, cacheMiddleware(10, (req) => `/api/cv/list:${req.user._id}`), cvController.list);
router.get('/skills', cvController.getSkillSuggestions);
router.get('/:id', requireAuth, cvController.getById);
router.delete('/:id', requireAuth, invalidateCvList, cvController.deleteCV);

module.exports = router;

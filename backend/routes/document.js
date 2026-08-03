const express = require('express');
const router = express.Router();
const documentController = require('../controllers/documentController');
const requireAuth = require('../middleware/requireAuth');
const { cacheMiddleware, invalidateCache } = require('../middleware/cache');

router.post('/generate', requireAuth, documentController.generateDocument);
router.post('/save', requireAuth, (req, res, next) => {
  // Invalidate document list cache after save
  res.on('finish', () => invalidateCache(`/api/document/list:${req.user?._id}`));
  next();
}, documentController.saveDocument);
router.get('/list', requireAuth, cacheMiddleware(10, (req) => `/api/document/list:${req.user._id}`), documentController.listDocuments);
router.get('/:id', requireAuth, documentController.getDocument);
router.get('/:id/download', requireAuth, documentController.downloadDocument);
router.patch('/:id/status', requireAuth, (req, res, next) => {
  res.on('finish', () => invalidateCache(`/api/document/list:${req.user?._id}`));
  next();
}, documentController.updateApplicationStatus);
router.delete('/:id', requireAuth, (req, res, next) => {
  res.on('finish', () => invalidateCache(`/api/document/list:${req.user?._id}`));
  next();
}, documentController.deleteDocument);
router.post('/:id/share', requireAuth, documentController.shareDocument);
router.get('/:id/share-stats', requireAuth, documentController.getShareStats);
router.get('/shared/:token/download', documentController.downloadSharedDocument);
router.get('/shared/:token', documentController.getSharedDocument);

module.exports = router;

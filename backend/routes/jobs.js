const express = require('express');
const router = express.Router();
const jobController = require('../controllers/jobController');
const requireAuth = require('../middleware/requireAuth');
const { cacheMiddleware } = require('../middleware/cache');

router.get('/', cacheMiddleware(60, (req) => `/api/jobs:${req.originalUrl}`), jobController.listJobs);
router.get('/applications', requireAuth, jobController.listApplications);
router.get('/alerts', requireAuth, jobController.listAlerts);
router.post('/alerts', requireAuth, jobController.createAlert);
router.put('/alerts/:id', requireAuth, jobController.updateAlert);
router.delete('/alerts/:id', requireAuth, jobController.deleteAlert);
router.get('/notifications', requireAuth, jobController.listNotifications);
router.get('/notifications/unread-count', requireAuth, jobController.unreadCount);
router.post('/notifications/read', requireAuth, jobController.markNotificationsRead);
router.post('/apply', requireAuth, jobController.createApplication);
router.post('/scrape', jobController.triggerScrape);
router.get('/:id', jobController.getJob);

module.exports = router;

const express = require('express');
const router = express.Router();
const jobController = require('../controllers/jobController');
const requireAuth = require('../middleware/requireAuth');
const optionalAuth = require('../middleware/optionalAuth');
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
// Batch, not per-job: a board page is up to 50 listings, and one request each
// would mean 50 round trips plus 50 CV lookups to render one page of badges.
// The job detail page calls this with a single id.
router.post('/match', requireAuth, jobController.matchJobs);
// Two callers are supported: the Admin UI (session cookie) and the external
// cron in .github/workflows/jobs-scrape.yml (`x-scrape-key` header, no cookie).
// optionalAuth populates req.user when a cookie is present without demanding
// one, so the header-based trigger keeps working.
router.post('/scrape', optionalAuth, jobController.triggerScrape);
router.get('/:id', jobController.getJob);

module.exports = router;

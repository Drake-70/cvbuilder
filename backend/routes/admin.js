const express = require('express');
const router = express.Router();
const requireAdmin = require('../middleware/requireAdmin');
const adminController = require('../controllers/adminController');
const adminKpiController = require('../controllers/adminKpiController');
const adminUsersController = require('../controllers/adminUsersController');

router.use(requireAdmin);

router.get('/dashboard', adminController.getDashboard);
router.get('/users', adminController.listUsers);
router.patch('/users/:id/role', adminController.updateUserRole);
router.patch('/users/:id/verified', adminController.setUserVerified);
router.get('/payments', adminController.listPayments);
router.get('/contacts', adminController.listContacts);
router.patch('/contacts/:id/status', adminController.updateContactStatus);

// Analytics and live health. Separate handlers from the list-and-toggle ones above,
// split by concern rather than by entity.
router.get('/kpis', adminKpiController.getKpis);
router.get('/health', adminKpiController.getHealth);

// Per-user observability and management.
router.get('/users/:id', adminUsersController.getUserDetail);
router.patch('/users/:id/suspended', adminUsersController.setUserSuspended);
router.post('/users/:id/force-logout', adminUsersController.forceLogout);
router.post('/users/:id/password-reset', adminUsersController.requestPasswordReset);
router.patch('/users/:id/credits', adminUsersController.adjustCredits);
router.patch('/users/:id/subscription', adminUsersController.setSubscription);
router.delete('/users/:id', adminUsersController.anonymiseUser);

// The accountability trail, read-only by construction: there is no route that
// writes, updates or deletes an audit entry, so the log cannot be edited through the
// API it is meant to make trustworthy.
router.get('/audit', adminUsersController.listAudit);

module.exports = router;

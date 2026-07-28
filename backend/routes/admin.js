const express = require('express');
const router = express.Router();
const requireAdmin = require('../middleware/requireAdmin');
const adminController = require('../controllers/adminController');

router.use(requireAdmin);

router.get('/dashboard', adminController.getDashboard);
router.get('/users', adminController.listUsers);
router.patch('/users/:id/role', adminController.updateUserRole);
router.get('/payments', adminController.listPayments);

module.exports = router;

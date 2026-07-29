const User = require('../models/User');
const TailoredDocument = require('../models/TailoredDocument');
const CV = require('../models/CV');
const Payment = require('../models/Payment');
const logger = require('../utils/logger');

exports.getDashboard = async (req, res, next) => {
  try {
    const [
      totalUsers,
      activeSubscriptions,
      totalDocuments,
      totalCVs,
      recentUsers,
      recentPayments
    ] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ subscriptionStatus: 'active' }),
      TailoredDocument.countDocuments(),
      CV.countDocuments(),
      User.find().sort({ createdAt: -1 }).limit(10).select('email name subscriptionStatus createdAt'),
      Payment.find().sort({ createdAt: -1 }).limit(10).select('userId amount status method createdAt')
    ]);

    res.json({
      stats: {
        totalUsers,
        activeSubscriptions,
        totalDocuments,
        totalCVs,
        freeUsers: totalUsers - activeSubscriptions
      },
      recentUsers,
      recentPayments
    });
  } catch (err) {
    next(err);
  }
};

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

exports.listUsers = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, search = '' } = req.query;
    const query = search
      ? { $or: [{ email: { $regex: escapeRegex(search), $options: 'i' } }, { name: { $regex: escapeRegex(search), $options: 'i' } }] }
      : {};

    const [users, total] = await Promise.all([
      User.find(query)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(parseInt(limit))
        .select('-resetPasswordToken -resetPasswordExpires'),
      User.countDocuments(query)
    ]);

    res.json({ users, total, page: parseInt(page), pages: Math.ceil(total / limit) });
  } catch (err) {
    next(err);
  }
};

exports.updateUserRole = async (req, res, next) => {
  try {
    const { role } = req.body;
    if (!['user', 'admin'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }

    const user = await User.findByIdAndUpdate(
      req.params.id,
      { role },
      { new: true }
    ).select('-resetPasswordToken -resetPasswordExpires');

    if (!user) return res.status(404).json({ error: 'User not found' });

    logger.info(`Admin ${req.user.email} changed ${user.email} role to ${role}`);
    res.json(user);
  } catch (err) {
    next(err);
  }
};

exports.listPayments = async (req, res, next) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const [payments, total] = await Promise.all([
      Payment.find()
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(parseInt(limit))
        .populate('userId', 'email name'),
      Payment.countDocuments()
    ]);

    res.json({ payments, total, page: parseInt(page), pages: Math.ceil(total / limit) });
  } catch (err) {
    next(err);
  }
};

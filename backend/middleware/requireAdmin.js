const jwt = require('jsonwebtoken');
const User = require('../models/User');
const enforceVerified = require('./requireVerified');

module.exports = async function requireAdmin(req, res, next) {
  try {
    const token = req.cookies.accessToken;
    if (!token) return res.status(401).json({ error: 'Authentication required' });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId).select('role email emailVerified');

    if (!user || user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    req.user = user;

    // Admins are exempt from the verification gate inside enforceVerified, but
    // calling it keeps this boundary consistent with requireAuth/optionalAuth
    // and means a future change to the exemptions applies here too.
    if (!enforceVerified(req, res)) return;

    next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
};
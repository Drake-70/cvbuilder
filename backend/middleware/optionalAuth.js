const jwt = require('jsonwebtoken');
const User = require('../models/User');

/**
 * Populates `req.user` when a valid access token cookie is present, but never
 * rejects the request. Use on endpoints that support two distinct callers, such
 * as a session-authenticated admin acting from the UI and an external cron
 * authenticating with a shared header. The route handler is still responsible
 * for authorizing the request.
 */
const optionalAuth = async (req, res, next) => {
  try {
    const token = req.cookies.accessToken;
    if (token) {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.user = await User.findById(decoded.userId).select('-passwordHash');
    }
  } catch {
    // An absent or invalid token simply means "not a signed-in user".
  }
  next();
};

module.exports = optionalAuth;

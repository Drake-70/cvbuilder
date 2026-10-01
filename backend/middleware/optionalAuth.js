const jwt = require('jsonwebtoken');
const User = require('../models/User');
const enforceVerified = require('./requireVerified');

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

  // Present only for routes that opt into the verification gate via its bypass
  // list. Doing the check here keeps optionalAuth symmetric with requireAuth
  // without changing the meaning of routes that do not.
  if (req.user && !enforceVerified(req, res)) return;

  next();
};

module.exports = optionalAuth;

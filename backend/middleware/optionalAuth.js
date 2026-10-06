const jwt = require('jsonwebtoken');
const User = require('../models/User');
const enforceVerified = require('./requireVerified');
const { issuedBeforeRevocation } = require('./requireAuth');
const activity = require('../services/activity');

/**
 * Populates `req.user` when a valid access token cookie is present, but never
 * rejects the request. Use on endpoints that support two distinct callers, such
 * as a session-authenticated admin acting from the UI and an external cron
 * authenticating with a shared header. The route handler is still responsible
 * for authorizing the request.
 *
 * "Valid" here means more than "verifies". A token that was signed correctly but
 * belongs to a session an admin has since ended, or to a suspended account, is
 * dropped rather than populated — treated as an anonymous caller, which is the same
 * answer `requireAuth` reaches for that request minus the status code. Populating it
 * anyway would leave `req.user` asserting an identity that has been withdrawn, and
 * downstream handlers trust this field to decide who is acting.
 *
 * Dropping rather than rejecting is deliberate: the contract of this middleware is
 * to never reject, and an external caller such as a cron job authenticating by
 * header must not start receiving 401s from a change to session state it has no part
 * in. What must not happen is that the withdrawn identity is acted on.
 */
const optionalAuth = async (req, res, next) => {
  try {
    const token = req.cookies.accessToken;
    if (token) {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.userId).select('-passwordHash');

      if (user && !user.suspended && !issuedBeforeRevocation(decoded, user)) {
        req.user = user;
      }
    }
  } catch {
    // An absent or invalid token simply means "not a signed-in user".
  }

  // Present only for routes that opt into the verification gate via its bypass
  // list. Doing the check here keeps optionalAuth symmetric with requireAuth
  // without changing the meaning of routes that do not.
  if (req.user && !enforceVerified(req, res)) return;

  // Same throttled stamp as requireAuth: a request is a request whether or not it
  // was mandatory, and a caller that only ever touches optional routes would
  // otherwise read as inactive. Fire-and-forget for the same reason — it can neither
  // delay nor fail a response here.
  if (req.user) activity.touch(req.user._id, User);

  next();
};

module.exports = optionalAuth;

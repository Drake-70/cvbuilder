const jwt = require('jsonwebtoken');
const User = require('../models/User');
const enforceVerified = require('./requireVerified');
const activity = require('../services/activity');

/**
 * Whether a token was issued before the user's sessions were revoked.
 *
 * Compares the token's own `iat` against `sessionInvalidBefore` rather than
 * comparing token versions: version rotation happens on every refresh, so using it
 * here would reject the access token a client is holding immediately after a
 * perfectly normal refresh. Comparing issue times revokes exactly the sessions that
 * existed when an admin acted.
 *
 * Second-resolution, because `iat` is a JWT numeric date. A token minted in the same
 * second as the revocation is treated as still valid; the window is one second and it
 * fails open deliberately, since the alternative is a suspension that intermittently
 * does not take effect on the account it was applied to.
 */
function issuedBeforeRevocation(decoded, user) {
  if (!user.sessionInvalidBefore) return false;
  if (!decoded.iat) return false;
  return decoded.iat * 1000 < user.sessionInvalidBefore.getTime();
}

const requireAuth = async (req, res, next) => {
  try {
    const token = req.cookies.accessToken;
    if (!token) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId).select('-passwordHash');
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    // Revoked sessions are refused before anything else, and with 401 rather than
    // 403: the credential is no longer valid, and the correct client response is to
    // log in again, not to show the user an error about permissions.
    if (issuedBeforeRevocation(decoded, user)) {
      return res.status(401).json({
        error: 'Your session was ended. Please log in again.',
        code: 'SESSION_REVOKED'
      });
    }

    // Suspension is checked before the verified gate on purpose. A suspended user is
    // refused for being suspended, and a client that only knows how to handle
    // "verify your email" would otherwise bounce them to a page that cannot help.
    if (user.suspended) {
      return res.status(403).json({
        error: 'This account has been suspended.',
        code: 'ACCOUNT_SUSPENDED',
        // Passed through so the UI can show the admin's reason instead of a bare
        // refusal. It is admin-authored text about this user's own account, not a
        // disclosure about anyone else.
        reason: user.suspendedReason || '',
        since: user.suspendedAt
      });
    }

    req.user = user;

    // Unverified accounts get a valid session but cannot use the app. Checked
    // here rather than per-route so a new endpoint cannot forget it.
    if (!enforceVerified(req, res)) return;

    // Fire-and-forget, after the decision to allow the request is already made, so it
    // can neither delay nor fail the response. Throttled internally.
    activity.touch(user._id, User);

    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired', code: 'TOKEN_EXPIRED' });
    }
    return res.status(401).json({ error: 'Invalid token' });
  }
};

module.exports = requireAuth;
module.exports.issuedBeforeRevocation = issuedBeforeRevocation;
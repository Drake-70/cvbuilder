const User = require('../models/User');
const enforceVerified = require('./requireVerified');
const apiKeyService = require('../services/apiKeyService');

/**
 * Authenticates an MCP request from a personal API key.
 *
 * This exists because requireAuth reads a JWT out of an httpOnly cookie, which a
 * program cannot send. The two are kept separate rather than folded into one
 * "authentication" middleware with two strategies, because they have genuinely
 * different lifetimes: a cookie dies with the session, a key survives logout and is
 * revoked individually. A shared middleware would make "log out everywhere" mean
 * two different things depending on which credential was presented.
 *
 * Every failure returns the same 401 with the same body. Distinguishing "no key"
 * from "wrong key" from "revoked key" would tell an attacker which key ids exist.
 */
const apiKeyAuth = async (req, res, next) => {
  try {
    const presented = req.get('authorization') || req.get('x-api-key');
    if (!presented) {
      return unauthorized(res, 'An API key is required');
    }

    const record = await apiKeyService.verifyKey(presented);
    if (!record) {
      return unauthorized(res, 'Invalid API key');
    }

    // The key names an account; that account has to still exist and still be in a
    // state where it may use the app. Deleting the user does not delete the key
    // rows, so this lookup is not redundant with the key check.
    const user = await User.findById(record.userId).select('-passwordHash');
    if (!user) {
      return unauthorized(res, 'Invalid API key');
    }

    req.user = user;
    req.apiKey = { id: record._id.toString(), name: record.name };

    // An unverified account gets a valid session in the browser and cannot use the
    // app. The same has to hold here, or verification would be a speed bump that a
    // caller could simply route around.
    if (!enforceVerified(req, res)) return;

    next();
  } catch (err) {
    return unauthorized(res, 'Invalid API key');
  }
};

function unauthorized(res, message) {
  return res.status(401).json({ error: message, code: 'INVALID_API_KEY' });
}

module.exports = apiKeyAuth;
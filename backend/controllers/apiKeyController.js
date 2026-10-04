const apiKeyService = require('../services/apiKeyService');

/**
 * Personal API keys, for clients that cannot hold a cookie.
 *
 * The web app authenticates with an httpOnly JWT cookie. An MCP client cannot send
 * one, and the alternative -- handing the session token to a third-party integration
 * -- means revoking every session to cut that integration off. So keys are their own
 * credential, listed and revoked individually, and they survive logout.
 */

exports.create = async (req, res, next) => {
  try {
    const key = await apiKeyService.createKey(req.user._id, req.body?.name);

    // The only response that will ever contain the plaintext. no-store because it is
    // a bearer credential: a cached copy would sit in a browser disk cache or a proxy
    // where nobody is watching, which is exactly the case a key that can be revoked
    // individually exists to avoid needing.
    res.set('Cache-Control', 'no-store');
    res.status(201).json({
      ...key,
      // Stated in the response because this is the only place it can be.
      notice: 'Copy this key now. It cannot be shown again.'
    });
  } catch (err) {
    next(err);
  }
};

exports.list = async (req, res, next) => {
  try {
    const keys = await apiKeyService.listKeys(req.user._id);
    res.set('Cache-Control', 'no-store');
    res.json({ keys });
  } catch (err) {
    next(err);
  }
};

exports.revoke = async (req, res, next) => {
  try {
    const revoked = await apiKeyService.revokeKey(req.user._id, req.params.id);
    // Not found rather than forbidden when the key belongs to someone else or was
    // already revoked: a 403 would confirm the id exists, and a second revoke
    // succeeding would mean revocation is not idempotent, which callers should not
    // have to reason about.
    if (!revoked) {
      return res.status(404).json({ error: 'No such active key' });
    }
    res.json({ revoked: true });
  } catch (err) {
    next(err);
  }
};

const requireAuth = require('./requireAuth');

/**
 * `requireAuth`, plus an administrator check.
 *
 * Composed rather than written alongside it. This guard used to verify the JWT
 * itself, which was a second, subtly different authentication path — and anything
 * added to `requireAuth` afterwards did not arrive here. Three things were therefore
 * missing from all seventeen admin routes:
 *
 * - The revocation check. Force-logging-out an admin, or issuing them a password
 *   reset, did nothing to their existing session until the token simply expired —
 *   which made the most security-relevant of the management actions a no-op against
 *   the only accounts it mattered most for.
 * - The suspension check, so a suspended admin carried on working.
 * - The activity stamp, so the most privileged accounts were the one group
 *   invisible to the activity data this admin panel reports on.
 *
 * Sharing one resolution is also what makes the next guard added to `requireAuth`
 * apply here automatically, rather than needing to be remembered twice.
 *
 * The role check runs *after* authentication, so a non-admin with a valid session
 * still gets 403 "Admin access required" and an invalid one still gets 401 from
 * `requireAuth`, exactly as before.
 *
 * @type {import('express').RequestHandler}
 */
function requireAdmin(req, res, next) {
  requireAuth(req, res, (err) => {
    // `requireAuth` sends its own failures and does not forward errors, but a
    // middleware that might one day call `next(err)` should not have that error
    // swallowed into a role check.
    if (err) return next(err);

    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    next();
  });
}

module.exports = requireAdmin;

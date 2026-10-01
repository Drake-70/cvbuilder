/**
 * Gate that blocks unverified accounts from the parts of the app that matter.
 *
 * Invoked from requireAuth / optionalAuth / requireAdmin rather than mounted as
 * its own middleware, because it can only run once something has populated
 * req.user. That is deliberate: wiring it per-route invites a new endpoint that
 * silently forgets the check, and mounting it globally in server.js would put it
 * *before* authentication, where req.user is still undefined and every request
 * would pass.
 *
 * The bypass list is the set of routes an unverified user needs in order to
 * escape the gate. Verifying, resending the mail, logging out and resetting a
 * password must all keep working: gate any of those and the state becomes
 * permanent, with no user action that can clear it.
 */

const BYPASS_PATHS = new Set([
  // Session establishment and management.
  '/api/auth/register',
  '/api/auth/login',
  '/api/auth/google-login',
  '/api/auth/google-redirect',
  '/api/auth/logout',
  '/api/auth/refresh',
  // Lets the frontend read emailVerified before anything is gated, so the
  // redirect to /verify-email can be driven from real state rather than guessed.
  '/api/auth/me',
  // Completing verification, and asking for a new link.
  '/api/auth/verify-email',
  '/api/auth/resend-verification',
  // Password recovery must work on an unverified account. Someone stuck here is
  // stuck precisely because they cannot read mail; without this a lost password
  // would make the account unrecoverable with no support path.
  '/api/auth/forgot-password',
  '/api/auth/reset-password',
  // Deleting the account. A user who cannot verify must still be able to walk
  // away, and blocking this would strand their data with no way to remove it.
  '/api/auth/account',
  // Runtime browser config. Unauthenticated, so it never reaches this gate, but
  // listed for clarity if that ever changes.
  '/api/config',
  // Internal cron trigger, authenticated by JOB_SCRAPE_KEY rather than a
  // session. Gating it would stop job scraping the moment an unverified user
  // happened to hold the admin cookie.
  '/api/jobs/scrape'
]);

/** Match on pathname only; a query string must not change the decision. */
function requestPath(req) {
  return (req.originalUrl || req.url || '').split('?')[0];
}

/**
 * True when the request may proceed. Writes the 403 itself when it may not, so
 * callers can simply `return enforce(req, res)`.
 */
function enforce(req, res) {
  // Operational escape hatch. If the mail provider breaks, every new signup is
  // stuck at the verification screen with nothing they can do; flipping this to
  // 'false' in the host's env restores access in seconds without a redeploy of
  // code. Only an explicit 'false' disables enforcement, so a typo or an unset
  // variable leaves the gate on.
  if (process.env.REQUIRE_EMAIL_VERIFICATION === 'false') return true;

  if (BYPASS_PATHS.has(requestPath(req))) return true;

  // No session is not this gate's concern. Whether an anonymous caller is
  // acceptable is requireAuth's / optionalAuth's decision; treating "anonymous"
  // as "unverified" would turn public read routes into 403s.
  if (!req.user) return true;

  if (req.user.emailVerified) return true;

  // Admins are exempt. An operator locked out of their own dashboard by an
  // unreachable mail provider cannot be the person who fixes the mail provider.
  if (req.user.role === 'admin') return true;

  res.status(403).json({
    error: 'Please verify your email address to continue.',
    code: 'EMAIL_NOT_VERIFIED'
  });
  return false;
}

module.exports = enforce;
module.exports.BYPASS_PATHS = BYPASS_PATHS;
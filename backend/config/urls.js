/**
 * Single source of truth for the app's own public origin.
 *
 * Precedence:
 *   1. FRONTEND_URL / CORS_ORIGIN - explicit configuration, wins when set.
 *   2. RENDER_EXTERNAL_URL       - injected by Render into every service, so a
 *                                  deploy is correct by default even when the
 *                                  Blueprint's `fromService` wiring never
 *                                  applied (e.g. a service created by hand, or
 *                                  renamed away from the Blueprint's `cvboost`).
 *   3. localhost                 - development.
 *
 * Without step 2, a manually created Render service silently fell back to
 * localhost, which sent every password-reset and verification email to
 * http://localhost:5173/reset-password - a dead link for every real user.
 */

const DEV_ORIGIN = 'http://localhost:5173';

function trimTrailingSlash(url) {
  return url.replace(/\/+$/, '');
}

// Treat a whitespace-only value as "not configured" so a stray space in a
// dashboard field cannot silently produce an empty allowlist.
function firstMeaningful(...values) {
  for (const v of values) {
    if (v && v.trim()) return v;
  }
  return DEV_ORIGIN;
}

function frontendUrl() {
  return trimTrailingSlash(firstMeaningful(
    process.env.FRONTEND_URL,
    process.env.CORS_ORIGIN,
    process.env.RENDER_EXTERNAL_URL
  ));
}

function allowedOrigins() {
  const raw = firstMeaningful(process.env.CORS_ORIGIN, process.env.RENDER_EXTERNAL_URL);
  const list = raw
    .split(',')
    .map((o) => trimTrailingSlash(o.trim()))
    .filter(Boolean);
  // Never hand back an empty list: every cross-origin request would be denied
  // with no obvious cause.
  return list.length ? list : [DEV_ORIGIN];
}

module.exports = { frontendUrl, allowedOrigins, DEV_ORIGIN };

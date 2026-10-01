import api from '../services/api';

/**
 * Runtime config the browser needs before anyone has a session.
 *
 * Cached for the life of the page: the values are static for a deploy, and this
 * is fetched by the login and register pages on mount.
 */

let cached = null;
let inFlight = null;

export async function getRuntimeConfig() {
  if (cached) return cached;
  // Two pages can mount at once (login after register, for instance). Share the
  // request rather than firing two.
  if (inFlight) return inFlight;

  inFlight = api
    .get('/config')
    .then((res) => {
      cached = res.data || {};
      return cached;
    })
    .catch(() => {
      // A config failure must not break the login form. An absent client ID
      // simply means the Google button stays hidden, which is exactly how the
      // app behaved before this endpoint existed.
      cached = {};
      return cached;
    })
    .finally(() => {
      inFlight = null;
    });

  return inFlight;
}

/**
 * The Google client ID, or null when Google sign-in is not configured.
 *
 * Prefers the runtime value and falls back to the build-time variable so a
 * local dev server (where VITE_GOOGLE_CLIENT_ID is set in a .env) keeps working
 * without the backend running.
 */
export async function getGoogleClientId() {
  const runtime = await getRuntimeConfig();
  return runtime.googleClientId || import.meta.env.VITE_GOOGLE_CLIENT_ID || null;
}
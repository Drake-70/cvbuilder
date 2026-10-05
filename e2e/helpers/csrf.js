/**
 * Returns the CSRF token for an API request context, priming the cookie first.
 *
 * The backend only issues the csrf-token cookie from a GET that actually reaches
 * the CSRF middleware, and two things that look like they should prime it do not:
 *
 *   - POST /api/auth/register is an auth bypass path, and bypass paths only set
 *     the cookie on GET. Registering leaves the jar empty.
 *   - GET /api/health is mounted ahead of the CSRF middleware in server.js, so
 *     the readiness probe never reaches setCsrfCookie either.
 *
 * Both mistakes had the same symptom and hid behind the same fallback: the specs
 * read the cookie with `|| ''`, so an absent cookie became an empty header and
 * the request came back as a bare 403 "Invalid CSRF token" with nothing pointing
 * at CSRF. Three specs were affected; one of them passed only because it happened
 * to prime with GET /api/auth/me first.
 *
 * This primes with GET /api/auth/me -- behind the middleware, and behind no
 * verification gate, so it works for verified and unverified accounts alike --
 * and throws when the cookie is still missing rather than sending an empty
 * header and letting the failure surface somewhere unrelated.
 */
async function csrfToken(request) {
  await request.get('/api/auth/me');

  const { cookies } = await request.storageState();
  const token = cookies.find((c) => c.name === 'csrf-token')?.value;

  if (!token) {
    throw new Error(
      'no csrf-token cookie after GET /api/auth/me. The backend sets it from setCsrfCookie, ' +
        'so either that route moved ahead of the CSRF middleware in server.js or the cookie ' +
        'flags changed.'
    );
  }

  return token;
}

module.exports = { csrfToken };
const { test } = require('node:test');
const assert = require('node:assert/strict');
const enforceVerified = require('../middleware/requireVerified');

// The gate runs inside requireAuth/optionalAuth/requireAdmin rather than as its
// own middleware, because it can only act once req.user is populated. What
// matters is the decision it makes per request.

function run(req) {
  const res = {
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    }
  };
  const allowed = enforceVerified(req, res);
  return { allowed, res };
}

const unverifiedUser = { _id: 'u1', emailVerified: false, role: 'user' };

test('an unverified user is blocked with a machine-readable code', () => {
  const { allowed, res } = run({ originalUrl: '/api/cv/list', user: unverifiedUser });
  assert.equal(allowed, false);
  assert.equal(res.statusCode, 403);
  assert.equal(res.body.code, 'EMAIL_NOT_VERIFIED');
});

test('the incident switch is opt-out, not opt-in', () => {
  // Absent or any other value keeps enforcement on. A forgotten variable must
  // fail closed.
  const previous = process.env.REQUIRE_EMAIL_VERIFICATION;
  delete process.env.REQUIRE_EMAIL_VERIFICATION;
  try {
    const { allowed } = run({ originalUrl: '/api/cv/list', user: unverifiedUser });
    assert.equal(allowed, false);
  } finally {
    if (previous !== undefined) process.env.REQUIRE_EMAIL_VERIFICATION = previous;
  }
});

test('a verified user passes', () => {
  const { allowed, res } = run({
    originalUrl: '/api/cv/list',
    user: { _id: 'u1', emailVerified: true, role: 'user' }
  });
  assert.equal(allowed, true);
  assert.equal(res.statusCode, null);
});

test('an anonymous request passes, because requireAuth owns that decision', () => {
  // If this returned 403 the gate would be turning public read routes into
  // errors for every signed-out visitor.
  const { allowed, res } = run({ originalUrl: '/api/jobs', user: undefined });
  assert.equal(allowed, true);
  assert.equal(res.statusCode, null);
});

test('admins pass even when unverified', () => {
  // An operator locked out by an unreachable mail provider cannot be the person
  // who fixes the mail provider.
  const { allowed } = run({
    originalUrl: '/api/admin/users',
    user: { _id: 'a1', emailVerified: false, role: 'admin' }
  });
  assert.equal(allowed, true);
});

test('a query string does not change the decision', () => {
  // cacheMiddleware rewrites req.url with cache keys, and originalUrl keeps the
  // real path; the bypass must key off the path alone or these drift apart.
  const { allowed } = run({
    originalUrl: '/api/auth/logout?x=1',
    url: '/api/auth/logout',
    user: unverifiedUser
  });
  assert.equal(allowed, true);
});

// Each of these must stay reachable or the user cannot escape the gate.
const ESCAPE_ROUTES = [
  '/api/auth/verify-email',
  '/api/auth/resend-verification',
  '/api/auth/logout',
  '/api/auth/login',
  '/api/auth/register',
  '/api/auth/me',
  '/api/auth/forgot-password',
  '/api/auth/reset-password',
  '/api/auth/account',
  '/api/jobs/scrape',
  '/api/config'
];

for (const route of ESCAPE_ROUTES) {
  test(`${route} stays reachable for an unverified user`, () => {
    const { allowed, res } = run({ originalUrl: route, user: unverifiedUser });
    assert.equal(allowed, true, `${route} would trap the user`);
    assert.equal(res.statusCode, null);
  });
}

test('REQUIRE_EMAIL_VERIFICATION=false disables the gate', () => {
  const previous = process.env.REQUIRE_EMAIL_VERIFICATION;
  process.env.REQUIRE_EMAIL_VERIFICATION = 'false';
  try {
    const { allowed } = run({ originalUrl: '/api/cv/list', user: unverifiedUser });
    assert.equal(allowed, true, 'the incident switch must restore access');
  } finally {
    if (previous === undefined) delete process.env.REQUIRE_EMAIL_VERIFICATION;
    else process.env.REQUIRE_EMAIL_VERIFICATION = previous;
  }
});

test('only the literal "false" disables the gate', () => {
  // "0", "no" and "" are all common ways to mean off, and all of them silently
  // disabling the gate would be the wrong default for a security control.
  const previous = process.env.REQUIRE_EMAIL_VERIFICATION;
  for (const truthyish of ['0', 'no', 'off', '', 'FALSE']) {
    process.env.REQUIRE_EMAIL_VERIFICATION = truthyish;
    const { allowed } = run({ originalUrl: '/api/cv/list', user: unverifiedUser });
    assert.equal(allowed, false, `${JSON.stringify(truthyish)} must not disable the gate`);
  }
  if (previous === undefined) delete process.env.REQUIRE_EMAIL_VERIFICATION;
  else process.env.REQUIRE_EMAIL_VERIFICATION = previous;
});

test('a gated route is still gated even when the path is a near-miss', () => {
  // Guards against a prefix match creeping in: /api/jobs/scraper must not be
  // treated as the exempt /api/jobs/scrape.
  const { allowed } = run({ originalUrl: '/api/jobs/scraper', user: unverifiedUser });
  assert.equal(allowed, false);
});

test('every bypass path is a literal, not a pattern', () => {
  for (const path of enforceVerified.BYPASS_PATHS) {
    assert.match(path, /^\/api\/[a-z0-9/_-]+$/, `${path} looks like a pattern, not a literal`);
  }
});
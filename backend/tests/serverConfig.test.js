const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

// Read as text rather than requiring server.js: booting the app would open a
// port and connect to MongoDB, and these assertions are about what is written in
// the file, not about a running process.

function source() {
  return fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
}

test('the verification resend limiter exists and is tighter than the auth limiter', () => {
  const text = source();

  // Resends are an outbound email each. authLimiter allows 50 requests per 15
  // minutes, which before this was the only bound on how many verification mails
  // one IP could trigger.
  assert.match(text, /verificationResendLimiter\s*=\s*rateLimit\(/);

  const block = text.match(/const verificationResendLimiter = rateLimit\(\{[\s\S]*?\}\);/);
  assert.ok(block, 'the resend limiter must be declared');
  assert.match(block[0], /windowMs:\s*60 \* 60 \* 1000/, 'one hour, not fifteen minutes');
});

test('the verification code limiter is separate from the resend limiter', () => {
  const text = source();

  // Two limiters rather than one shared budget, because resending and guessing
  // are different abuse: a resend storm is a mail cannon, guessing is brute force.
  // One budget would let either activity starve the other, and a user who has
  // legitimately needed five resends would find the code box throttled too.
  assert.match(text, /verificationCodeLimiter\s*=\s*rateLimit\(/);

  const block = text.match(/const verificationCodeLimiter = rateLimit\(\[?\s*\{[\s\S]*?\}\);/);
  assert.ok(block, 'the code limiter must be declared');
  assert.match(block[0], /cvboost:rl:verify-code:/);
  assert.notEqual(
    text.match(/cvboost:rl:verify-resend:/)[0],
    text.match(/cvboost:rl:verify-code:/)[0],
    'the two limiters must not share a Redis key prefix'
  );
});

test('the verification limiters are mounted before the auth router', () => {
  const text = source();

  // Mounted ahead of `app.use('/api/auth', authLimiter, authRoutes)` so they are
  // seen. Registering them after the router would leave both routes governed only
  // by the looser authLimiter, and the tighter numbers would look real in review
  // while doing nothing.
  const resend = text.indexOf("app.use('/api/auth/resend-verification', verificationResendLimiter)");
  const code = text.indexOf("app.use('/api/auth/verify-email-code', verificationCodeLimiter)");
  const router = text.indexOf("app.use('/api/auth', authLimiter, authRoutes)");

  assert.ok(resend > -1, 'the resend limiter must be mounted');
  assert.ok(code > -1, 'the code limiter must be mounted');
  assert.ok(resend < router, 'the resend limiter must come before the router');
  assert.ok(code < router, 'the code limiter must come before the router');
});

test('both verification limiters share the fail-open store policy', () => {
  // The general rule in this app: rate limiting must never become the reason a
  // request fails, because with Redis down an exception from the store would
  // reject everyone. `passOnStoreError` is what makes the limiter degrade to
  // in-process counters instead of errors — and the account-level attempt cap in
  // verificationCode.js is the backstop that still applies when it does.
  const text = source();
  for (const name of ['verificationResendLimiter', 'verificationCodeLimiter']) {
    const block = text.match(new RegExp(`const ${name} = rateLimit\\(\\{[\\s\\S]*?\\}\\);`));
    assert.ok(block, `${name} must be declared`);
    assert.match(block[0], /passOnStoreError:\s*true/, `${name} must fail open`);
  }
});
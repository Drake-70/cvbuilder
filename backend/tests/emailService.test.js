const { test, mock } = require('node:test');
const assert = require('node:assert/strict');

const emailService = require('../services/emailService');
const User = require('../models/User');

const CONTROLLER_PATH = require.resolve('../controllers/authController');
const EMAIL_PATH = require.resolve('../services/emailService');

/**
 * Minimal Express response double.
 *
 * `res.json()` records 200 as its status, matching Express: a handler that
 * answers via `json()` without calling `status()` is a 200, and a double that
 * leaves the status null would report a successful path as "never responded".
 */
function fakeRes() {
  return {
    statusCode: null,
    body: null,
    cookie() { return this; },
    clearCookie() { return this; },
    status(code) { this.statusCode = code; return this; },
    json(payload) { if (this.statusCode === null) this.statusCode = 200; this.body = payload; return this; }
  };
}

/**
 * Load a pristine `emailService`, dropping the controller alongside it.
 *
 * Both modules must be dropped together: `emailService` memoises its
 * transporter in module scope, so clearing only the controller would make it
 * bind a *different* `emailService` instance than the one under test, and any
 * mock installed here would be silently ignored.
 */
function loadEmail() {
  delete require.cache[CONTROLLER_PATH];
  delete require.cache[EMAIL_PATH];
  return require('../services/emailService');
}

/**
 * Require the controller against whatever `emailService` is currently cached.
 *
 * Deliberately separate from `loadEmail`, and deliberately called *after* the
 * stubs are installed: `authController` destructures the send functions at
 * require time, so a controller loaded before the mock runs would keep the real
 * functions and pass or fail for the wrong reason.
 */
function loadController() {
  delete require.cache[CONTROLLER_PATH];
  return require('../controllers/authController');
}

test.afterEach(() => {
  mock.restoreAll();
  delete require.cache[CONTROLLER_PATH];
  delete require.cache[EMAIL_PATH];
});

// ---------------------------------------------------------------------------
// The root cause: failure is signalled by resolving, not by rejecting.
// ---------------------------------------------------------------------------

test('sendMail reports a transport failure without rejecting', async () => {
  // Every call site guarded these sends with `.catch(...)`, which only fires on
  // a rejection. `sendMail` catches its own transport errors and *resolves*
  // `{ success: false }`, so a broken Brevo key or an unverified sender was
  // logged once and then treated as success by the caller. This is the invariant
  // the whole fix rests on, so it is asserted directly rather than through a
  // controller that could pass for the wrong reason.
  const axios = require('axios');
  const saved = { key: process.env.BREVO_API_KEY, from: process.env.SMTP_FROM };
  process.env.BREVO_API_KEY = 'test-key';
  process.env.SMTP_FROM = 'CVBoost <verified@example.com>';

  const email = loadEmail();
  mock.method(axios, 'post', async () => {
    const err = new Error('Request failed with status code 400');
    err.response = { status: 400, data: { message: 'sender is not verified' } };
    throw err;
  });

  try {
    const result = await email.sendMail({ to: 'a@b.com', subject: 's', text: 't' });
    assert.equal(result.success, false, 'a failed send must not report success');
    assert.match(result.error, /sender/i, 'the reason must survive to the caller');
  } finally {
    if (saved.key === undefined) delete process.env.BREVO_API_KEY;
    else process.env.BREVO_API_KEY = saved.key;
    if (saved.from === undefined) delete process.env.SMTP_FROM;
    else process.env.SMTP_FROM = saved.from;
  }
});

test('a console-only transport is distinguishable from a real send', async () => {
  // With nothing configured, `sendMail` returns `success: true` and writes the
  // message to the log. That is the trap: a deploy that cannot send anything is
  // indistinguishable from one that can, which is how a broken mail setup stays
  // invisible until someone waits for a verification link. `consoleOnly` is the
  // marker; `transportStatus` is what puts it on the startup line.
  const saved = { k: process.env.BREVO_API_KEY, h: process.env.SMTP_HOST };
  delete process.env.BREVO_API_KEY;
  delete process.env.SMTP_HOST;

  const email = loadEmail();
  try {
    const result = await email.sendMail({ to: 'a@b.com', subject: 's', text: 't' });
    assert.equal(result.success, true);
    assert.equal(result.consoleOnly, true, 'a console-only send must be marked as such');
    assert.equal(email.transportStatus(), 'console');
  } finally {
    if (saved.k !== undefined) process.env.BREVO_API_KEY = saved.k;
    if (saved.h !== undefined) process.env.SMTP_HOST = saved.h;
  }
});

test('transportStatus names the real delivery paths', () => {
  const keys = ['BREVO_API_KEY', 'SMTP_HOST', 'SMTP_USER', 'SMTP_PASS'];
  const saved = {};
  for (const k of keys) saved[k] = process.env[k];

  const check = (env) => {
    for (const k of keys) delete process.env[k];
    Object.assign(process.env, env);
    return emailService.transportStatus();
  };

  try {
    assert.equal(check({ BREVO_API_KEY: 'k' }), 'brevo', 'Brevo over HTTPS is the Render path');
    assert.equal(check({ SMTP_HOST: 'h', SMTP_USER: 'u', SMTP_PASS: 'p' }), 'smtp');
    assert.equal(check({ SMTP_HOST: 'h' }), 'smtp-no-auth', 'a host without credentials sends nothing');
    assert.equal(check({}), 'console');
    // A field that was cleared but left as whitespace must read as unset, or the
    // summary reports a transport that is configured and cannot authenticate.
    assert.equal(check({ BREVO_API_KEY: '   ' }), 'console');
    assert.equal(check({ SMTP_HOST: ' ', SMTP_USER: 'u', SMTP_PASS: 'p' }), 'console');
  } finally {
    for (const k of keys) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  }
});

// ---------------------------------------------------------------------------
// resendVerification: the endpoint that used to lie.
// ---------------------------------------------------------------------------

const unverifiedUser = () => ({
  _id: 'u1',
  email: 'a@b.com',
  emailVerified: false,
  preferredLanguage: 'en',
  save: async () => {}
});

test('resendVerification reports a failed send instead of claiming success', async () => {
  // Regression: the endpoint answered 200 `{ message: 'Verification email
  // sent' }` unconditionally, because the failure was only ever visible to a
  // `.catch()` that could not run. A user who clicked Resend was told a message
  // was on its way and had no way to learn it had failed.
  mock.method(User, 'findById', async () => unverifiedUser());

  const email = loadEmail();
  mock.method(email, 'sendVerificationEmail', async () => ({
    success: false,
    error: 'Brevo rejected the sender'
  }));

  const res = fakeRes();
  await loadController().resendVerification({ user: { _id: 'u1' } }, res, (e) => { throw e; });

  assert.equal(res.statusCode, 502, 'a failed send must not be reported as success');
  assert.equal(res.body.emailSent, false);
  assert.match(res.body.error, /could not send/i);
  assert.match(res.body.error, /sender/i, 'the real reason must reach the user');
});

test('resendVerification still reports a real send', async () => {
  mock.method(User, 'findById', async () => unverifiedUser());

  const email = loadEmail();
  mock.method(email, 'sendVerificationEmail', async () => ({ success: true }));

  const res = fakeRes();
  await loadController().resendVerification({ user: { _id: 'u1' } }, res, (e) => { throw e; });

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.emailSent, true);
  assert.match(res.body.message, /sent/i);
});

test('resendVerification survives a send that throws rather than resolves', async () => {
  // `sendMail` only guards the transport call, so a throw while *building* the
  // transport would escape. The handler must still answer with the real reason
  // rather than falling through to the error middleware as an opaque 500.
  mock.method(User, 'findById', async () => unverifiedUser());

  const email = loadEmail();
  mock.method(email, 'sendVerificationEmail', async () => {
    throw new Error('transport construction exploded');
  });

  const res = fakeRes();
  await loadController().resendVerification({ user: { _id: 'u1' } }, res, (e) => { throw e; });

  assert.equal(res.statusCode, 502);
  assert.match(res.body.error, /transport construction exploded/);
});

// ---------------------------------------------------------------------------
// forgotPassword: identical response either way, by design.
// ---------------------------------------------------------------------------

test('forgotPassword gives the same answer whether or not delivery failed', async () => {
  // The deliberate asymmetry with resendVerification. Reporting a delivery
  // failure here would distinguish "this account exists but mail is broken"
  // from "no such account" — turning the endpoint into an account-enumeration
  // oracle. The reply must be identical in both cases; only the log may differ.
  mock.method(User, 'findOne', async () => ({
    _id: 'u1',
    email: 'a@b.com',
    emailVerified: true,
    preferredLanguage: 'en',
    save: async () => {}
  }));

  const failing = loadEmail();
  mock.method(failing, 'sendPasswordResetEmail', async () => ({
    success: false,
    error: 'Brevo is down'
  }));
  const resFailed = fakeRes();
  await loadController().forgotPassword(
    { body: { email: 'a@b.com' } }, resFailed, (e) => { throw e; }
  );

  mock.restoreAll();
  mock.method(User, 'findOne', async () => ({
    _id: 'u1',
    email: 'a@b.com',
    emailVerified: true,
    preferredLanguage: 'en',
    save: async () => {}
  }));

  const working = loadEmail();
  mock.method(working, 'sendPasswordResetEmail', async () => ({ success: true }));
  const resSent = fakeRes();
  await loadController().forgotPassword(
    { body: { email: 'a@b.com' } }, resSent, (e) => { throw e; }
  );

  assert.equal(resFailed.statusCode, 200);
  assert.equal(resSent.statusCode, 200);
  assert.deepEqual(
    resFailed.body,
    resSent.body,
    'a failed send must be indistinguishable from a successful one to the caller'
  );
  assert.equal(resFailed.body.emailSent, undefined, 'no delivery signal may leak in the body');
});

test('forgotPassword answers the same way for an unknown address', async () => {
  // The other half of the anti-enumeration guarantee: an address with no
  // account and an address whose mail failed must be indistinguishable, so the
  // endpoint cannot be used to test whether someone is registered.
  const email = loadEmail();
  mock.method(User, 'findOne', async () => null);
  mock.method(email, 'sendPasswordResetEmail', async () => ({ success: true }));

  const resUnknown = fakeRes();
  await loadController().forgotPassword(
    { body: { email: 'nobody@example.com' } }, resUnknown, (e) => { throw e; }
  );

  assert.equal(resUnknown.statusCode, 200);
  assert.match(resUnknown.body.message, /if an account exists/i);
  assert.equal(
    resUnknown.body.emailSent,
    undefined,
    'an unknown address must not be distinguishable from a known one'
  );
});

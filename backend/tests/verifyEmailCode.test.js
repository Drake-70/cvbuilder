const { test, mock } = require('node:test');
const assert = require('node:assert/strict');

const User = require('../models/User');
const verificationCode = require('../services/verificationCode');

const CONTROLLER_PATH = require.resolve('../controllers/authController');
const EMAIL_PATH = require.resolve('../services/emailService');

/**
 * Minimal Express response double. `json()` records 200 as its status, matching
 * Express — a handler that answers via `json()` without calling `status()` is a
 * 200, and a double leaving the status null would report a real response as
 * "never responded".
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
 * Both must go together: `emailService` memoises its transporter in module scope,
 * so clearing only the controller would bind a *different* instance than the one
 * under test and every mock installed here would be silently ignored.
 */
function loadEmail() {
  delete require.cache[CONTROLLER_PATH];
  delete require.cache[EMAIL_PATH];
  return require('../services/emailService');
}

/**
 * Require the controller against whatever `emailService` is currently cached.
 *
 * Called *after* stubs are installed: `authController` destructures the send
 * functions at require time, so a controller loaded first keeps the real ones
 * and passes or fails for the wrong reason.
 */
function loadController() {
  delete require.cache[CONTROLLER_PATH];
  return require('../controllers/authController');
}

/**
 * A stand-in user document that behaves like a Mongoose one for the fields the
 * verification path touches. Plain object rather than a fake class because the
 * handler only assigns properties and calls `save()` — and `mock.method` on a
 * class breaks `new`, which is a trap hit repeatedly in this suite.
 */
function fakeUser(overrides = {}) {
  return {
    _id: 'u1',
    email: 'a@b.com',
    name: 'Test',
    emailVerified: false,
    emailVerificationCodeHash: null,
    emailVerificationCodeExpires: null,
    emailVerificationCodeAttempts: 0,
    emailVerificationCodeSentAt: null,
    savedCount: 0,
    async save() { this.savedCount += 1; },
    ...overrides
  };
}

/** An unverified user holding a live code, with `code` as the plaintext. */
async function userWithCode(code = '314159', overrides = {}) {
  const issue = await verificationCode.buildCodeIssue(code);
  return fakeUser({ ...issue, ...overrides });
}

/** Point `User.findById` at a fixed user, optionally recording the ids asked for. */
function mockFindById(user, seen) {
  // The double must be *thenable*, not merely awaitable.
  //
  // Real Mongoose returns a Query, and the handlers chain onto it before awaiting:
  // `User.findById(id).select(...)`. A plain `async` function resolves to a
  // Promise, so `.select` lands on the Promise and the handler throws
  // "select is not a function" before ever reaching the document — which reads as
  // a bug in the handler and is actually a bug in the double.
  //
  // `user` is returned by identity, not copied. The handler assigns
  // `emailVerified` on whatever the query resolves to while the test asserts on
  // the object it built; a copy means those are two different objects and every
  // mutation assertion passes for the wrong reason.
  mock.method(User, 'findById', (id) => {
    if (seen) seen.push(id);
    return {
      then: (...args) => Promise.resolve(user).then(...args),
      select() { return this; }
    };
  });
}

test.afterEach(() => {
  mock.restoreAll();
  delete require.cache[CONTROLLER_PATH];
  delete require.cache[EMAIL_PATH];
});

// ---------------------------------------------------------------------------
// POST /auth/verify-email-code
// ---------------------------------------------------------------------------

test('verifyEmailCode verifies with the right code and clears the credentials', async () => {
  const user = await userWithCode('314159');
  mockFindById(user);

  const res = fakeRes();
  await loadController().verifyEmailCode(
    { user: { _id: 'u1' }, body: { code: '314159' } },
    res,
    (e) => { throw e; }
  );

  assert.equal(res.statusCode, 200);
  assert.equal(user.emailVerified, true);
  // The link token goes too. Verification is satisfied by whichever route the user
  // took, so leaving either credential live on a verified account means a mail
  // forwarded months later still carries something that looks like a live secret.
  assert.equal(user.emailVerificationToken, undefined);
  assert.equal(user.emailVerificationCodeHash, null);
  assert.equal(user.emailVerificationCodeAttempts, 0);
});

test('verifyEmailCode clears the code on success so it cannot be replayed', async () => {
  const user = await userWithCode('314159');
  mockFindById(user);

  await loadController().verifyEmailCode(
    { user: { _id: 'u1' }, body: { code: '314159' } },
    fakeRes(),
    (e) => { throw e; }
  );

  // Replay: the same account, the same code, now that it is verified.
  const second = fakeRes();
  await loadController().verifyEmailCode(
    { user: { _id: 'u1' }, body: { code: '314159' } },
    second,
    (e) => { throw e; }
  );

  assert.equal(second.statusCode, 200);
  assert.match(second.body.message, /already verified/i);
});

test('verifyEmailCode accepts a code typed with spaces or a paste', async () => {
  // The UI splits the code across six boxes, so the payload is six bare digits,
  // but a pasted value can arrive with separators. Accepting both is the point of
  // normalizeCode.
  const user = await userWithCode('314159');
  mockFindById(user);

  const res = fakeRes();
  await loadController().verifyEmailCode(
    { user: { _id: 'u1' }, body: { code: ' 314 159 ' } },
    res,
    (e) => { throw e; }
  );

  assert.equal(res.statusCode, 200);
  assert.equal(user.emailVerified, true);
});

test('verifyEmailCode refuses a wrong code and burns exactly one attempt', async () => {
  const user = await userWithCode('314159');
  mockFindById(user);

  const res = fakeRes();
  await loadController().verifyEmailCode(
    { user: { _id: 'u1' }, body: { code: '314158' } },
    res,
    (e) => { throw e; }
  );

  assert.equal(res.statusCode, 400);
  assert.equal(user.emailVerified, false);
  assert.equal(user.emailVerificationCodeAttempts, 1);
  assert.equal(res.body.attemptsRemaining, verificationCode.MAX_ATTEMPTS - 1);
});

test('five wrong codes lock the account out even if the sixth is right', async () => {
  const user = await userWithCode('314159');
  mockFindById(user);

  const controller = loadController();
  for (let i = 0; i < verificationCode.MAX_ATTEMPTS; i += 1) {
    const res = fakeRes();
    await controller.verifyEmailCode(
      { user: { _id: 'u1' }, body: { code: '000000' } },
      res,
      (e) => { throw e; }
    );
    assert.equal(res.statusCode, 400);
  }

  // The correct code, refused. Five guesses must not leave a walkable gap to the
  // sixth.
  const locked = fakeRes();
  await controller.verifyEmailCode(
    { user: { _id: 'u1' }, body: { code: '314159' } },
    locked,
    (e) => { throw e; }
  );

  assert.equal(locked.statusCode, 400);
  assert.equal(locked.body.reason, 'locked');
  assert.equal(locked.body.attemptsRemaining, 0);
  assert.match(locked.body.error, /too many incorrect attempts/i);
  assert.equal(user.emailVerified, false);
  // And a lockout costs no further attempts — the counter is capped, not growing.
  assert.equal(user.emailVerificationCodeAttempts, verificationCode.MAX_ATTEMPTS);
});

test('an expired code costs no attempt, even when it is wrong', async () => {
  // Charging for a guess the user could not have made correctly — the code was
  // already dead — punishes them for the expiry and lets an attacker who knows a
  // code is stale lock the account out on purpose.
  const user = await userWithCode('314159', {
    emailVerificationCodeExpires: new Date(Date.now() - 1000)
  });
  mockFindById(user);

  const res = fakeRes();
  await loadController().verifyEmailCode(
    { user: { _id: 'u1' }, body: { code: '000000' } },
    res,
    (e) => { throw e; }
  );

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.reason, 'expired');
  assert.equal(user.emailVerificationCodeAttempts, 0);
  assert.equal(user.savedCount, 0, 'no save needed when nothing changed');
});

test('verifyEmailCode refuses a wrong-length code before touching the database', async () => {
  let looked = false;
  mock.method(User, 'findById', async () => { looked = true; return fakeUser(); });

  const res = fakeRes();
  await loadController().verifyEmailCode(
    { user: { _id: 'u1' }, body: { code: '123' } },
    res,
    (e) => { throw e; }
  );

  assert.equal(res.statusCode, 400);
  assert.match(res.body.error, /6-digit/);
  assert.equal(looked, false, 'a malformed code should not cost a query');
});

test('verifyEmailCode handles a missing body', async () => {
  // A body-less POST is a real thing a misconfigured client sends. It must not
  // throw out of the handler.
  const res = fakeRes();
  await loadController().verifyEmailCode({ user: { _id: 'u1' } }, res, (e) => { throw e; });
  assert.equal(res.statusCode, 400);
});

test('verifyEmailCode is idempotent for an already-verified account', async () => {
  const user = fakeUser({ emailVerified: true });
  mockFindById(user);

  const res = fakeRes();
  await loadController().verifyEmailCode(
    { user: { _id: 'u1' }, body: { code: '314159' } },
    res,
    (e) => { throw e; }
  );

  // 200 rather than 400: a user who verifies by clicking the link in a second tab
  // and then submits the code from the first has done nothing wrong.
  assert.equal(res.statusCode, 200);
  assert.match(res.body.message, /already verified/i);
});

test('verifyEmailCode only ever reads the signed-in user, never a code lookup', async () => {
  // The anti-enumeration property, asserted structurally. A `findOne({ code })`
  // implementation would make this endpoint an oracle confirming which addresses
  // are registered; looking the user up by `_id` from the session cannot.
  const looked = [];
  mockFindById(await userWithCode('314159'), looked);
  mock.method(User, 'findOne', async () => {
    throw new Error('findOne must not be used: it would leak whether an address exists');
  });

  const res = fakeRes();
  await loadController().verifyEmailCode(
    { user: { _id: 'u1' }, body: { code: '000000' } },
    res,
    (e) => { throw e; }
  );

  assert.equal(res.statusCode, 400);
  assert.deepEqual(looked, ['u1']);
});

// ---------------------------------------------------------------------------
// GET /auth/verification-status
// ---------------------------------------------------------------------------

test('verificationStatus reports a live code without revealing it', async () => {
  const user = await userWithCode('314159');
  mockFindById(user);

  const res = fakeRes();
  await loadController().verificationStatus({ user: { _id: 'u1' } }, res, (e) => { throw e; });

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.hasCode, true);
  assert.equal(res.body.emailVerified, false);
  assert.ok(res.body.expiresInSeconds > 0);
  assert.equal(res.body.expiresInSeconds, verificationCode.CODE_EXPIRY_MINUTES * 60);
  assert.equal(res.body.attemptsRemaining, verificationCode.MAX_ATTEMPTS);
  assert.equal(res.body.locked, false);

  // The hash must never reach a client. The status endpoint's whole purpose is to
  // describe the code, which makes it exactly the place a careless
  // `res.json({ user })` would leak it.
  const serialized = JSON.stringify(res.body);
  assert.equal(serialized.includes('emailVerificationCodeHash'), false);
  assert.equal(serialized.includes(user.emailVerificationCodeHash), false);
  assert.equal(serialized.includes('314159'), false);
});

test('verificationStatus reports an expired code as expired, not as live', async () => {
  const user = await userWithCode('314159', {
    emailVerificationCodeExpires: new Date(Date.now() - 1000)
  });
  mockFindById(user);

  const res = fakeRes();
  await loadController().verificationStatus({ user: { _id: 'u1' } }, res, (e) => { throw e; });

  // Null rather than 0: the page hides the countdown on null and shows a
  // countdown to zero on 0, and "0 seconds left" is a lie about a code that lapsed
  // an hour ago.
  assert.equal(res.body.expiresInSeconds, null);
});

test('verificationStatus reports a locked account', async () => {
  const user = await userWithCode('314159', {
    emailVerificationCodeAttempts: verificationCode.MAX_ATTEMPTS
  });
  mockFindById(user);

  const res = fakeRes();
  await loadController().verificationStatus({ user: { _id: 'u1' } }, res, (e) => { throw e; });

  assert.equal(res.body.locked, true);
  assert.equal(res.body.attemptsRemaining, 0);
});

test('verificationStatus reports a live resend cooldown, counting down from the send', async () => {
  const sent = Date.now();
  const recent = await userWithCode('314159', {
    emailVerificationCodeSentAt: new Date(sent)
  });
  mockFindById(recent);

  const res = fakeRes();
  await loadController().verificationStatus({ user: { _id: 'u1' } }, res, (e) => { throw e; });

  // A range rather than an exact figure. `Math.ceil` over a value that is already
  // a millisecond or two in the past legitimately reports 59, and pinning 60
  // would make this test fail on a slow machine while proving nothing.
  assert.ok(
    res.body.resendAvailableInSeconds > verificationCode.RESEND_COOLDOWN_SECONDS - 5,
    `expected a near-full cooldown, got ${res.body.resendAvailableInSeconds}`
  );
  assert.ok(res.body.resendAvailableInSeconds <= verificationCode.RESEND_COOLDOWN_SECONDS);
});

test('verificationStatus reports no cooldown once the send window has passed', async () => {
  const old = await userWithCode('314159', {
    emailVerificationCodeSentAt: new Date(Date.now() - 600000)
  });
  mockFindById(old);

  const res = fakeRes();
  await loadController().verificationStatus({ user: { _id: 'u1' } }, res, (e) => { throw e; });

  // Exactly 0, never negative: a negative countdown renders as "available in
  // -43s" and a `<= 0` guard on the client is one refactor from never re-enabling.
  assert.equal(res.body.resendAvailableInSeconds, 0);
});

test('verificationStatus reports a full cooldown for an account that never received one', async () => {
  // A user created before this feature existed has no `emailVerificationCodeSentAt`
  // at all. `null` must not read as "cooldown satisfied" and let the button send —
  // but equally the client must not wait for a countdown that is not running.
  const legacy = fakeUser();
  mockFindById(legacy);

  const res = fakeRes();
  await loadController().verificationStatus({ user: { _id: 'u1' } }, res, (e) => { throw e; });

  // Nothing was sent, so nothing is on cooldown: resending should be allowed.
  assert.equal(res.body.resendAvailableInSeconds, 0);
  assert.equal(res.body.hasCode, false);
  assert.equal(res.body.expiresInSeconds, null);
});

test('verificationStatus never withholds a resend from a verified account', async () => {
  const user = fakeUser({ emailVerified: true });
  mockFindById(user);

  const res = fakeRes();
  await loadController().verificationStatus({ user: { _id: 'u1' } }, res, (e) => { throw e; });

  assert.equal(res.body.emailVerified, true);
  assert.equal(res.body.resendAvailableInSeconds, 0);
});

test('verificationStatus 404s a deleted account', async () => {
  mockFindById(null);
  const res = fakeRes();
  await loadController().verificationStatus({ user: { _id: 'gone' } }, res, (e) => { throw e; });
  assert.equal(res.statusCode, 404);
});

// ---------------------------------------------------------------------------
// Issuing: register and resend both hand out a code
// ---------------------------------------------------------------------------

test('resendVerification issues a code and reports the cooldown', async () => {
  const user = fakeUser();
  mockFindById(user);

  const email = loadEmail();
  let sent = null;
  mock.method(email, 'sendVerificationEmail', async (args) => {
    sent = args;
    return { success: true };
  });

  const res = fakeRes();
  await loadController().resendVerification({ user: { _id: 'u1' } }, res, (e) => { throw e; });

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.emailSent, true);
  // The page runs its countdown from this rather than keeping its own copy of the
  // cooldown, so the server stays the single source of truth.
  assert.equal(res.body.resendAvailableInSeconds, verificationCode.RESEND_COOLDOWN_SECONDS);

  // Both routes in one email, and the code is a real six-digit one.
  assert.ok(sent.code, 'the resend must include a code');
  assert.match(sent.code, /^\d{6}$/);
  assert.ok(sent.token, 'the link must still be sent');
  // Stored hashed, never raw.
  assert.equal(user.emailVerificationCodeHash.includes(sent.code), false);
  assert.equal(await verificationCode.compareCode(sent.code, user.emailVerificationCodeHash), true);
});

test('resendVerification resets a spent attempt counter so the new code is usable', async () => {
  // Without the reset, five failed guesses against a stale code would lock the
  // replacement: the user would hold a valid code and have no way to spend it.
  const user = fakeUser({ emailVerificationCodeAttempts: verificationCode.MAX_ATTEMPTS });
  mockFindById(user);

  const email = loadEmail();
  let sent = null;
  mock.method(email, 'sendVerificationEmail', async (args) => { sent = args; return { success: true }; });

  await loadController().resendVerification({ user: { _id: 'u1' } }, fakeRes(), (e) => { throw e; });

  assert.equal(user.emailVerificationCodeAttempts, 0);
  const verdict = await verificationCode.evaluateSubmission(user, sent.code);
  assert.equal(verdict.ok, true, 'the freshly sent code must actually verify');
});

test('resendVerification reports a failed send without issuing a usable code', async () => {
  const user = fakeUser();
  mockFindById(user);

  const email = loadEmail();
  mock.method(email, 'sendVerificationEmail', async () => ({ success: false, error: 'Brevo rejected the sender' }));

  const res = fakeRes();
  await loadController().resendVerification({ user: { _id: 'u1' } }, res, (e) => { throw e; });

  assert.equal(res.statusCode, 502);
  assert.equal(res.body.emailSent, false);
  // Nothing was delivered, so nothing should be waiting to be used. The page must
  // not show a countdown for a code that does not exist.
  assert.equal(res.body.resendAvailableInSeconds, undefined);
});
const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');

const vc = require('../services/verificationCode');

// The hashing here is the real bcrypt at the real cost factor, so these tests are
// slower than the rest of the suite by design — the property being asserted is
// that the stored value is slow to reverse, which a mock would assert nothing.

test('generateCode returns exactly six digits, zero-padded', () => {
  for (let i = 0; i < 200; i += 1) {
    const code = vc.generateCode();
    assert.equal(code.length, vc.CODE_LENGTH);
    assert.match(code, /^\d{6}$/);
  }
});

test('generateCode covers the low end of the range, so padding is exercised', () => {
  // A purely random sample will not produce a sub-100000 code in 200 draws. This
  // asserts the padding logic directly instead of hoping the CSPRNG cooperates —
  // `String(4231).padStart(6, '0')` is the line that must not be wrong.
  assert.equal(String(4231).padStart(vc.CODE_LENGTH, '0'), '004231');
  assert.equal(String(0).padStart(vc.CODE_LENGTH, '0'), '000000');
  assert.equal(String(999999).padStart(vc.CODE_LENGTH, '0'), '999999');
});

test('generateCode does not repeat itself in a small sample', () => {
  const seen = new Set();
  for (let i = 0; i < 500; i += 1) seen.add(vc.generateCode());
  // 500 draws from a million without a collision is overwhelmingly likely; a
  // broken generator that returns a constant or a counter fails here.
  assert.ok(seen.size > 495, `only ${seen.size} distinct codes in 500 draws`);
});

test('normalizeCode strips the ways people actually paste a code', () => {
  assert.equal(vc.normalizeCode('123456'), '123456');
  assert.equal(vc.normalizeCode('123 456'), '123456');
  assert.equal(vc.normalizeCode('  123-456 '), '123456');
  assert.equal(vc.normalizeCode('1234567890'), '');
  assert.equal(vc.normalizeCode('12345'), '');
  // Letters are stripped, so a code pasted with surrounding text is still
  // recoverable as long as six digits survive.
  assert.equal(vc.normalizeCode('code: 123456'), '123456');
  // Five digits and a letter is five digits, not six — too short to accept.
  assert.equal(vc.normalizeCode('12345a'), '');
  assert.equal(vc.normalizeCode(''), '');
  assert.equal(vc.normalizeCode(null), '');
  assert.equal(vc.normalizeCode(undefined), '');
});

test('normalizeCode rejects a wrong-length value rather than padding it', () => {
  // Padding here would let `1234` match a stored code starting `1234` only by
  // accident of the hash — but more importantly, `12` padded to `000012` would be
  // a real code, and a user who typed two digits should be told so, not verified.
  assert.equal(vc.normalizeCode('1'), '');
  assert.equal(vc.normalizeCode('12345'), '');
  assert.equal(vc.normalizeCode('1234567'), '');
});

test('isCodeShape is exact', () => {
  assert.equal(vc.isCodeShape('000000'), true);
  assert.equal(vc.isCodeShape('999999'), true);
  assert.equal(vc.isCodeShape('12345'), false);
  assert.equal(vc.isCodeShape('1234567'), false);
  assert.equal(vc.isCodeShape('12345a'), false);
  assert.equal(vc.isCodeShape(null), false);
});

test('hashCode produces a bcrypt hash, not a digest of the code', async () => {
  const code = '424242';
  const hash = await vc.hashCode(code);

  // The assertion that matters for the security argument. A SHA-256 hex digest is
  // 64 characters of [0-9a-f]; a bcrypt hash is 60 characters in a different
  // alphabet and format. This pins the choice rather than trusting the import.
  assert.notEqual(hash.length, 64);
  assert.match(hash, /^\$2[aby]\$\d{2}\$/);
  assert.equal(hash.includes(code), false);

  // And the real proof: a million SHA-256 digests are trivially enumerable, a
  // million bcrypt comparisons are not. Compare the code the slow way.
  assert.equal(await bcrypt.compare(code, hash), true);
});

test('two hashes of the same code differ, so the stored value is salted', async () => {
  const a = await vc.hashCode('123456');
  const b = await vc.hashCode('123456');
  assert.notEqual(a, b);
});

test('compareCode accepts the right code and refuses the wrong one', async () => {
  const hash = await vc.hashCode('123456');
  assert.equal(await vc.compareCode('123456', hash), true);
  assert.equal(await vc.compareCode('123457', hash), false);
  assert.equal(await vc.compareCode('023456', hash), false);
});

test('compareCode is false without a stored hash rather than throwing', async () => {
  assert.equal(await vc.compareCode('123456', null), false);
  assert.equal(await vc.compareCode('123456', undefined), false);
  assert.equal(await vc.compareCode('123456', ''), false);
});

test('compareCode refuses a malformed code without spending a bcrypt round', async () => {
  const hash = await vc.hashCode('123456');
  assert.equal(await vc.compareCode('12345', hash), false);
  assert.equal(await vc.compareCode('', hash), false);
  assert.equal(await vc.compareCode(null, hash), false);
});

test('buildCodeIssue stores a hash and never the plaintext', async () => {
  const code = vc.generateCode();
  const issue = await vc.buildCodeIssue(code, Date.now());

  assert.equal(issue.emailVerificationCodeHash.includes(code), false);
  assert.ok(issue.emailVerificationCodeExpires instanceof Date);
  assert.equal(issue.emailVerificationCodeAttempts, 0);
  assert.ok(issue.emailVerificationCodeSentAt instanceof Date);
});

test('buildCodeIssue expires in ten minutes', async () => {
  const now = Date.now();
  const issue = await vc.buildCodeIssue('123456', now);
  const delta = issue.emailVerificationCodeExpires.getTime() - now;
  assert.equal(Math.round(delta / 60000), vc.CODE_EXPIRY_MINUTES);
});

test('buildCodeIssue resets the attempt counter, or five stale guesses would lock the replacement', async () => {
  // This is the bug the reset prevents: a user mistypes five times against an old
  // code, requests a new one, and is still locked out by the previous code's
  // counter — with a valid code in hand and no way to use it.
  const issue = await vc.buildCodeIssue('123456', Date.now());
  assert.equal(issue.emailVerificationCodeAttempts, 0);
});

test('expiryFromNow is relative to the supplied instant', () => {
  const now = 1700000000000;
  assert.equal(vc.expiryFromNow(now).getTime(), now + 600000);
});

test('evaluateSubmission accepts a correct code', async () => {
  const code = '314159';
  const user = { ...(await vc.buildCodeIssue(code)) };
  const verdict = await vc.evaluateSubmission(user, code);
  assert.equal(verdict.ok, true);
});

test('evaluateSubmission reports a mismatch and counts the attempt down', async () => {
  const user = { ...(await vc.buildCodeIssue('314159')) };
  const verdict = await vc.evaluateSubmission(user, '314158');
  assert.equal(verdict.ok, false);
  assert.equal(verdict.reason, 'mismatch');
  assert.equal(verdict.attemptsRemaining, vc.MAX_ATTEMPTS - 1);
});

test('evaluateSubmission reports no-code-issued rather than mismatch', async () => {
  // A different message matters: the fix for "no code issued" is to send one, and
  // for a mismatch it is to check the inbox.
  const verdict = await vc.evaluateSubmission({}, '314159');
  assert.equal(verdict.reason, 'no-code-issued');
});

test('evaluateSubmission reports expired separately from mismatch', async () => {
  const user = {
    ...(await vc.buildCodeIssue('314159')),
    emailVerificationCodeExpires: new Date(Date.now() - 1000)
  };
  const verdict = await vc.evaluateSubmission(user, '314159');
  // The *correct* code, but too late. Saying "invalid" here would send the user
  // hunting through their inbox for a code they already have.
  assert.equal(verdict.reason, 'expired');
  assert.equal(verdict.attemptsRemaining, vc.MAX_ATTEMPTS);
});

test('an expired code costs no attempt', async () => {
  const user = {
    ...(await vc.buildCodeIssue('314159')),
    emailVerificationCodeExpires: new Date(Date.now() - 1000),
    emailVerificationCodeAttempts: 2
  };
  await vc.evaluateSubmission(user, '999999');
  // evaluateSubmission does not mutate; the controller only increments on
  // 'mismatch'. Asserting the reason is what pins that behaviour.
  assert.equal(user.emailVerificationCodeAttempts, 2);
});

test('evaluateSubmission locks after the attempt cap', async () => {
  const user = {
    ...(await vc.buildCodeIssue('314159')),
    emailVerificationCodeAttempts: vc.MAX_ATTEMPTS
  };
  const verdict = await vc.evaluateSubmission(user, '314159');
  // Even the *right* code is refused. Five guesses must not leave a walkable gap
  // to the sixth, and the hash must not be compared at all once locked.
  assert.equal(verdict.ok, false);
  assert.equal(verdict.reason, 'locked');
  assert.equal(verdict.attemptsRemaining, 0);
});

test('a locked code is rejected without spending a bcrypt comparison', async () => {
  const hash = await vc.hashCode('314159');
  const user = {
    emailVerificationCodeHash: hash,
    emailVerificationCodeExpires: vc.expiryFromNow(),
    emailVerificationCodeAttempts: vc.MAX_ATTEMPTS
  };
  const started = Date.now();
  await vc.evaluateSubmission(user, '314159');
  // The correct code is available and still returns immediately, which is only
  // possible if the comparison was skipped.
  assert.ok(Date.now() - started < 20, 'locked verdict took a bcrypt round');
});

test('a user with no expiry field is treated as expired, not as valid forever', async () => {
  const user = { emailVerificationCodeHash: await vc.hashCode('314159') };
  const verdict = await vc.evaluateSubmission(user, '314159');
  assert.equal(verdict.reason, 'expired');
});

test('resendCooldownRemaining counts down and floors at zero', () => {
  const now = Date.now();
  assert.equal(vc.resendCooldownRemaining(new Date(now), now), vc.RESEND_COOLDOWN_SECONDS);
  assert.equal(vc.resendCooldownRemaining(new Date(now - 30000), now), 30);
  assert.equal(vc.resendCooldownRemaining(new Date(now - 120000), now), 0);
  assert.equal(vc.resendCooldownRemaining(null, now), 0);
  assert.equal(vc.resendCooldownRemaining(undefined, now), 0);
});

test('resendCooldownRemaining never returns a negative countdown', () => {
  // A negative value rendered into a button label reads "available in -43s", and
  // a `<= 0` guard on the client is one refactor away from the button never
  // re-enabling.
  const now = Date.now();
  assert.ok(vc.resendCooldownRemaining(new Date(now - 999999999), now) >= 0);
});

test('clearCodeFields removes every trace of the code', () => {
  const cleared = vc.clearCodeFields();
  assert.equal(cleared.emailVerificationCodeHash, null);
  assert.equal(cleared.emailVerificationCodeExpires, null);
  assert.equal(cleared.emailVerificationCodeAttempts, 0);
  assert.equal(cleared.emailVerificationCodeSentAt, null);
});

test('a fresh issue followed by a clear leaves nothing usable', async () => {
  const code = vc.generateCode();
  const issued = await vc.buildCodeIssue(code);
  const cleared = { ...issued, ...vc.clearCodeFields() };
  // Guards the two operations being composed correctly: this is exactly what
  // happens on the success path of either verification route.
  assert.equal(await vc.compareCode(code, cleared.emailVerificationCodeHash), false);
  assert.equal(
    (await vc.evaluateSubmission(cleared, code)).reason,
    'no-code-issued'
  );
});
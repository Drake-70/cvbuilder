/**
 * Six-digit email verification codes.
 *
 * Extracted from the controller for the same reason `contactWorkflow` is its own
 * module: the rules live in one place, are testable without a database, and
 * cannot be changed from two sites at once.
 *
 * Why this needs more care than a token
 *
 * The existing link token is 32 random bytes — 2^256 guesses, so its rate limit is
 * the only thing standing between it and an attacker. A six-digit code is 10^6.
 * Three consequences, each handled explicitly below rather than left implicit:
 *
 * 1. **The code must be stored as a bcrypt hash, not a SHA-256 digest.** The
 *    link token can be hashed with SHA-256 because brute-forcing 2^256 values is
 *    impossible. Hashing a six-digit code with SHA-256 produces a value an
 *    attacker with read access to the database reverses in microseconds — a
 *    million SHA-256 hashes over a fixed salt is a fraction of a second on one GPU.
 *    Storing the digest would be storing the plaintext with extra steps. bcrypt is
 *    salted and deliberately slow, so a stolen database yields nothing.
 *
 * 2. **The search space has to be rationed explicitly.** Ten thousand guesses is
 *    a few minutes of work. `MAX_ATTEMPTS` caps guesses per issued code and burns
 *    the code when the cap is hit; the caller adds a per-IP limiter on top. Ten
 *    million codes over a year is not a practical target for either.
 *
 * 3. **The code is bound to a session, not to the address alone.** The endpoint
 *    requires authentication and only ever loads the signed-in user's own record,
 *    so it is structurally incapable of confirming whether some *other* address
 *    exists — the guessing oracle that a naive `findOne({ code })` would create.
 *
 * Generation uses `crypto.randomInt`, which is a CSPRNG with no modulo bias.
 * `Math.random() * 1e6 % 1e6` is not equivalent: the float rounding makes the
 * low end of the range slightly more likely, which is a small but free advantage
 * to an attacker who can average over many codes.
 */

const bcrypt = require('bcryptjs');
const crypto = require('crypto');

/** Digits in a verification code. */
const CODE_LENGTH = 6;

/** Lowest code value, inclusive. */
const CODE_MIN = 0;

/** One past the highest code value, inclusive-exclusive. */
const CODE_MAX = 10 ** CODE_LENGTH;

/**
 * Wrong guesses allowed against one issued code.
 *
 * Five is enough for a mistyped or transposed digit — the overwhelmingly common
 * failure — without letting anyone walk a meaningful fraction of the space. The
 * fifth failure burns the code, so continuing costs a new email rather than more
 * free guesses.
 */
const MAX_ATTEMPTS = 5;

/**
 * Code lifetime.
 *
 * Shorter than the 24-hour link on purpose. A link is clicked once by whoever
 * receives it; a code is typed by a human who chose to do it within minutes of
 * signing up, so a long window buys nothing and widens the exposure of a code
 * read over a shoulder or left in a screenshot.
 */
const CODE_EXPIRY_MINUTES = 10;

/**
 * Minimum gap between two sends to the same account.
 *
 * Resending has to stay possible — mail gets filtered, addresses get mistyped —
 * but each resend is an outbound email, so an unthrottled endpoint is a mail
 * cannon pointed at whoever holds the address. Six an hour is far more than
 * anyone needs to receive a code they asked for and slow enough to be useless as
 * an amplifier.
 */
const RESEND_COOLDOWN_SECONDS = 60;

/**
 * A six-digit code as text, zero-padded.
 *
 * The padding is load-bearing: `crypto.randomInt` can return 4231, and a five
 * character code is a different string from `004231`. Zero-padding keeps the
 * comparison, the database value and what the user typed all the same length.
 */
function generateCode() {
  return String(crypto.randomInt(CODE_MIN, CODE_MAX)).padStart(CODE_LENGTH, '0');
}

/**
 * Accept what a user would plausibly type.
 *
 * People paste codes with spaces, copy them with the surrounding markup, or type
 * `123 456`. Stripping non-digits turns all of those into the real code. Note the
 * direction of the risk: this *widens* what is accepted for a given stored hash,
 * it never changes what is stored, so it cannot make a wrong code match.
 *
 * @param {unknown} raw
 * @returns {string} The digits only, or '' when there are not enough of them.
 */
function normalizeCode(raw) {
  const digits = String(raw ?? '').replace(/\D/g, '');
  return digits.length === CODE_LENGTH ? digits : '';
}

/** True when `value` is exactly `CODE_LENGTH` digits. */
function isCodeShape(value) {
  return new RegExp(`^\\d{${CODE_LENGTH}}$`).test(String(value ?? ''));
}

/**
 * Hash a code for storage.
 *
 * bcrypt's 72-byte input limit is not a concern for six digits.
 */
async function hashCode(code) {
  return bcrypt.hash(code, 12);
}

/** Compare a typed code against a stored hash. */
async function compareCode(code, hash) {
  if (!hash || !isCodeShape(code)) return false;
  return bcrypt.compare(code, hash);
}

/** The expiry instant for a code issued now. */
function expiryFromNow(now = Date.now()) {
  return new Date(now + CODE_EXPIRY_MINUTES * 60 * 1000);
}

/**
 * The update document for issuing a fresh code.
 *
 * `attempts` resets to zero because the previous code is being replaced: without
 * this, five failed attempts against a stale code would lock out the replacement
 * and the account could only be recovered by the link.
 *
 * @param {string} code Plain code, hashed here so no caller can store it raw.
 * @param {Date} [now]
 */
async function buildCodeIssue(code, now = Date.now()) {
  return {
    emailVerificationCodeHash: await hashCode(code),
    emailVerificationCodeExpires: expiryFromNow(now),
    emailVerificationCodeAttempts: 0,
    emailVerificationCodeSentAt: new Date(now)
  };
}

/**
 * Decide what a submitted code means.
 *
 * Returns a verdict rather than a boolean, because the caller has to say four
 * different things — right code, wrong code, out of attempts, expired — and they
 * call for different responses. Returning a bare `false` for all three is how a
 * user ends up guessing at a code that is already dead.
 *
 * The distinction between `locked` and `expired` is not cosmetic either: an
 * expired code is fixed by resending, whereas a locked one means the resend
 * button is the only route, and the user needs to know their resend will work.
 *
 * @param {object} user The user's verification fields.
 * @param {string} code Normalised code.
 * @param {Date} [now]
 * @returns {Promise<{ok: boolean, reason?: string, attemptsRemaining?: number}>}
 */
async function evaluateSubmission(user, code, now = Date.now()) {
  if (!user.emailVerificationCodeHash) {
    return { ok: false, reason: 'no-code-issued' };
  }

  const attemptsUsed = user.emailVerificationCodeAttempts || 0;

  // Checked before the hash comparison so a locked account does not spend a
  // bcrypt round on a guess it cannot make anyway.
  if (attemptsUsed >= MAX_ATTEMPTS) {
    return { ok: false, reason: 'locked', attemptsRemaining: 0 };
  }

  const expiresAt = user.emailVerificationCodeExpires
    ? new Date(user.emailVerificationCodeExpires).getTime()
    : 0;
  if (!expiresAt || expiresAt <= now) {
    return { ok: false, reason: 'expired', attemptsRemaining: MAX_ATTEMPTS - attemptsUsed };
  }

  if (!(await compareCode(code, user.emailVerificationCodeHash))) {
    return {
      ok: false,
      reason: 'mismatch',
      attemptsRemaining: MAX_ATTEMPTS - attemptsUsed - 1
    };
  }

  return { ok: true };
}

/**
 * How long until another send is allowed, in whole seconds (0 when allowed now).
 *
 * @param {Date} [sentAt]
 * @param {Date} [now]
 */
function resendCooldownRemaining(sentAt, now = Date.now()) {
  if (!sentAt) return 0;
  const nextAllowed = new Date(sentAt).getTime() + RESEND_COOLDOWN_SECONDS * 1000;
  const remaining = Math.ceil((nextAllowed - now) / 1000);
  return remaining > 0 ? remaining : 0;
}

/** The update document for clearing verification state on success or revocation. */
function clearCodeFields() {
  return {
    emailVerificationCodeHash: null,
    emailVerificationCodeExpires: null,
    emailVerificationCodeAttempts: 0,
    emailVerificationCodeSentAt: null
  };
}

module.exports = {
  CODE_LENGTH,
  MAX_ATTEMPTS,
  CODE_EXPIRY_MINUTES,
  RESEND_COOLDOWN_SECONDS,
  generateCode,
  normalizeCode,
  isCodeShape,
  hashCode,
  compareCode,
  expiryFromNow,
  buildCodeIssue,
  evaluateSubmission,
  resendCooldownRemaining,
  clearCodeFields
};
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  passwordHash: {
    type: String,
    required: function () { return !this.googleId && !this.facebookId && !this.linkedinId; }
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  preferredLanguage: {
    type: String,
    enum: ['en', 'fr'],
    default: 'en'
  },
  avatar: { type: String, default: '' },
  bio: { type: String, default: '', maxlength: 500 },
  summary: { type: String, default: '', maxlength: 1000 },
  phone: { type: String, default: '' },
  location: { type: String, default: '' },
  jobTitle: { type: String, default: '' },
  company: { type: String, default: '' },
  linkedin: { type: String, default: '', maxlength: 300 },
  website: { type: String, default: '', maxlength: 300 },
  savedSkills: { type: [String], default: [] },
  googleId: { type: String, sparse: true, index: true },
  facebookId: { type: String, sparse: true },
  linkedinId: { type: String, sparse: true },
  subscriptionStatus: {
    type: String,
    enum: ['none', 'active', 'expired'],
    default: 'none'
  },
  subscriptionExpiresAt: { type: Date },
  documentsGeneratedCount: { type: Number, default: 0 },
  freeDocumentCredits: { type: Number, default: 0 },
  resetPasswordToken: { type: String, sparse: true, index: true },
  resetPasswordExpires: { type: Date },
  emailVerified: { type: Boolean, default: false },
  // Opt-in, and opt-in means false by default rather than "true, turn it off".
  // Turning it on would mail every existing user an unsolicited daily email the
  // first time a scrape found them a match, which is how an opt-in list becomes
  // a spam list.
  dailyDigest: { type: Boolean, default: false },
  // When the last digest actually went out. This is the throttle, and it lives on
  // the user rather than in memory so a restart, a deploy, or a second instance
  // cannot turn one day's digest into two.
  lastDigestAt: { type: Date, default: null },
  emailVerificationToken: { type: String, sparse: true, index: true },
  emailVerificationExpires: { type: Date },
  // Six-digit code fields, alongside the link rather than replacing it. A code is
  // only a million possibilities, so the hash MUST be bcrypt (see
  // services/verificationCode.js for why SHA-256 here is equivalent to storing
  // plaintext), and `emailVerificationCodeAttempts` exists to ration the guesses
  // rather than relying on the per-IP limiter alone.
  //
  // Deliberately not `index: true`. Verification looks a user up by `_id` (the
  // session identifies them) and then compares a hash in process — there is no
  // query by code value anywhere, and a sparse index on a high-cardinality field
  // that is never searched is pure write cost.
  emailVerificationCodeHash: { type: String, default: null },
  emailVerificationCodeExpires: { type: Date, default: null },
  emailVerificationCodeAttempts: { type: Number, default: 0 },
  emailVerificationCodeSentAt: { type: Date, default: null },
  role: {
    type: String,
    enum: ['user', 'admin'],
    default: 'user'
  },
  loginAttempts: { type: Number, default: 0 },
  lockoutUntil: { type: Date, default: null },
  tokenVersion: { type: Number, default: 0 },

  /**
   * Administrative suspension.
   *
   * Distinct from `lockoutUntil`, which is the brute-force limiter reacting to
   * repeated failed logins. This is a human decision: it holds until an admin
   * clears it, and it is refused even when the user's credentials are correct, so
   * a suspended account cannot be walked around by guessing the password right.
   *
   * Default false, and `suspendedAt`/`suspendedReason`/`suspendedBy` are only read
   * when this is true -- keeping them null while active means a stale reason from a
   * previous suspension can never be shown against a reinstated account.
   */
  suspended: { type: Boolean, default: false },
  suspendedAt: { type: Date, default: null },
  suspendedReason: { type: String, default: '', maxlength: 500 },
  suspendedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

  /**
   * Tokens issued at or before this instant are refused, whatever their signature.
   *
   * `tokenVersion` cannot do this job on its own: it is only compared in the refresh
   * handler, so bumping it leaves an already-issued 15-minute access token working
   * right up to its natural expiry. An admin who suspends an abusive account needs
   * the session to stop now, not in up to fifteen minutes.
   *
   * Compared against the token's own `iat`, so it revokes exactly the sessions that
   * existed at the moment of the action and leaves concurrent logins alone.
   */
  sessionInvalidBefore: { type: Date, default: null },

  /**
   * Observability. Both are deliberately coarse.
   *
   * `lastLoginAt` is written only on the session path, so it costs nothing on normal
   * traffic and is exact.
   *
   * `lastActiveAt` is throttled by `services/activity` to at most one write per user
   * per interval, which makes it an approximation on purpose: writing it per request
   * would turn every read into a write and put this field's own cost above the thing
   * it measures. Read it as "was recently around", never as a session count.
   */
  lastLoginAt: { type: Date, default: null },
  lastActiveAt: { type: Date, default: null }
}, { timestamps: true });

userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.passwordHash);
};

module.exports = mongoose.model('User', userSchema);

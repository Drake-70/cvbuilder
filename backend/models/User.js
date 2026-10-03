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
  tokenVersion: { type: Number, default: 0 }
}, { timestamps: true });

userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.passwordHash);
};

module.exports = mongoose.model('User', userSchema);

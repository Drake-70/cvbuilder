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
  phone: { type: String, default: '' },
  location: { type: String, default: '' },
  jobTitle: { type: String, default: '' },
  company: { type: String, default: '' },
  googleId: { type: String, sparse: true },
  facebookId: { type: String, sparse: true },
  linkedinId: { type: String, sparse: true },
  subscriptionStatus: {
    type: String,
    enum: ['none', 'active', 'expired'],
    default: 'none'
  },
  subscriptionExpiresAt: { type: Date },
  documentsGeneratedCount: { type: Number, default: 0 },
  resetPasswordToken: { type: String },
  resetPasswordExpires: { type: Date },
  role: {
    type: String,
    enum: ['user', 'admin'],
    default: 'user'
  }
}, { timestamps: true });

userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.passwordHash);
};

module.exports = mongoose.model('User', userSchema);

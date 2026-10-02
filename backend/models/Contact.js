const mongoose = require('mongoose');

const contactSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  email: {
    type: String,
    required: true,
    lowercase: true,
    trim: true
  },
  subject: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200
  },
  message: {
    type: String,
    required: true,
    maxlength: 2000
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  // `new` -> `read` -> `replied` is the intended path, and the only way
  // backwards is reopening, which is deliberate: someone who replied and then
  // gets a follow-up has genuinely unread new mail. `archived` sits outside the
  // workflow for messages that need no reply (spam, duplicate submissions).
  status: {
    type: String,
    enum: ['new', 'read', 'replied', 'archived'],
    default: 'new'
  },
  // Who last moved it, and when. An inbox with no record of who replied is
  // indistinguishable from one where nobody did.
  statusChangedAt: { type: Date, default: null },
  statusChangedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  // The reply text, kept with the message so the thread is readable later.
  // Not sent from here — this records a reply composed elsewhere, so the app
  // does not take on delivering it and reporting whether it arrived.
  reply: {
    type: String,
    default: '',
    maxlength: 5000
  },
  repliedAt: { type: Date, default: null }
}, { timestamps: true });

contactSchema.index({ createdAt: -1 });
// The inbox opens filtered and sorted by status, so the common query — newest
// unread first — must not be a collection scan.
contactSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('Contact', contactSchema);

const mongoose = require('mongoose');

/**
 * Every admin-initiated change to a user, kept permanently.
 *
 * Admin actions are the ones in this app that cannot be undone and cannot be
 * distinguished from ordinary traffic afterwards. The log lines in winston answer
 * "did this happen"; they do not answer "who suspended this account, when, and what
 * did they say the reason was" once the log has rotated, and they are shipped to a
 * third party, which is a poor place to keep an audit trail that may be needed to
 * answer a user disputing their own suspension.
 *
 * Two rules make this trustworthy rather than decorative:
 *
 * 1. Append only. Nothing in the app updates or deletes these documents, so the
 *    collection is not evidence that anyone thought it was.
 * 2. `before`/`after` are recorded as given. The audit entry says what the admin
 *    asked for and what the database then held, which is what lets a later reader
 *    tell a deliberate change from one that silently did not apply.
 *
 * `targetEmail` is denormalised on purpose. If the user is later deleted -- which is
 * an action this app supports -- a trail that only held the id would be
 * unattributable, and an audit log that cannot name who was acted on is the one case
 * an audit log exists for.
 */
const adminAuditSchema = new mongoose.Schema({
  action: {
    type: String,
    required: true,
    // Closed set rather than free text: an audit trail that accepts anything cannot
    // be queried ("show me every credential reset") without first normalising by hand.
    enum: [
      'user.suspend',
      'user.reinstate',
      'user.force_logout',
      'user.role_changed',
      'user.verified_changed',
      'user.password_reset',
      'user.credits_changed',
      'user.subscription_changed',
      'user.deleted'
    ]
  },
  // The admin who acted. Kept as an id *and* an email: ids outlive account deletion,
  // but a human reading the trail needs the name.
  adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  adminEmail: { type: String, required: true },
  targetUserId: { type: mongoose.Schema.Types.ObjectId, required: true },
  targetEmail: { type: String, required: true },
  // Admin-authored text, such as a suspension reason. Not a request or response body:
  // this is displayed back to the affected user, so it must never carry a credential.
  reason: { type: String, default: '', maxlength: 500 },
  before: { type: mongoose.Schema.Types.Mixed, default: null },
  after: { type: mongoose.Schema.Types.Mixed, default: null }
}, { timestamps: { createdAt: true, updatedAt: false } });

// The monitoring trail is read newest-first, filtered by target for the per-user
// view and by admin for the accountability view. Both are covered by this compound
// direction; the timestamps option alone would not serve the per-target query.
adminAuditSchema.index({ targetUserId: 1, createdAt: -1 });
adminAuditSchema.index({ createdAt: -1 });

module.exports = mongoose.model('AdminAudit', adminAuditSchema);
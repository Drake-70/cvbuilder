const mongoose = require('mongoose');

/**
 * One document per browser subscription. A user can have several (phone,
 * laptop, two browsers), so this is not embedded on User.
 *
 * endpoint is the push service URL and is unique across the whole system: the
 * same browser profile subscribing twice yields the same endpoint, and silently
 * creating a duplicate row would double-deliver every notification.
 */
const pushSubscriptionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  endpoint: {
    type: String,
    required: true,
    unique: true
  },
  keys: {
    p256dh: { type: String, required: true },
    auth: { type: String, required: true }
  },
  userAgent: {
    type: String,
    default: ''
  }
}, { timestamps: true });

// The userId index is declared inline above (`index: true`). Declaring it here
// as well produced two definitions of the same index and a Mongoose warning on
// every boot; the inline form is the one that stays.

module.exports = mongoose.model('PushSubscription', pushSubscriptionSchema);
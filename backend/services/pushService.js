const PushSubscription = require('../models/PushSubscription');
const pushConfig = require('../config/push');
const logger = require('../utils/logger');

/**
 * Send a push message to every browser a user has subscribed.
 *
 * Delivery is best-effort and never throws: a push failure must not roll back
 * the database write that triggered it (a Notification, an Application). Each
 * failure is logged and, where the push service says the subscription is dead,
 * that row is deleted so we stop retrying it forever.
 */
async function sendToUser(userId, payload) {
  if (!pushConfig.isConfigured()) return { sent: 0, pruned: 0 };
  if (!pushConfig.setDetails()) return { sent: 0, pruned: 0 };

  const subscriptions = await PushSubscription.find({ userId }).lean();
  if (!subscriptions.length) return { sent: 0, pruned: 0 };

  const body = JSON.stringify(payload);
  const dead = [];
  let sent = 0;

  for (const sub of subscriptions) {
    try {
      await pushConfig.webpush.sendNotification(
        { endpoint: sub.endpoint, keys: sub.keys },
        body
      );
      sent += 1;
    } catch (err) {
      // 404/410 mean the browser or push service discarded the subscription.
      // Retrying is pointless, so drop the row. Anything else (a push service
      // outage, an expired VAPID key) is transient and must be kept.
      if (err.statusCode === 404 || err.statusCode === 410) {
        dead.push(sub._id);
      } else {
        logger.warn(`Push failed for ${sub.endpoint.slice(0, 60)}…: ${err.message}`);
      }
    }
  }

  if (dead.length) {
    // Best-effort cleanup: a failure here just means we retry a dead endpoint
    // next time, which is not worth failing the caller over.
    await PushSubscription.deleteMany({ _id: { $in: dead } }).catch(() => {});
  }

  return { sent, pruned: dead.length };
}

/** Fire-and-forget wrapper for call sites that must not await or propagate failures. */
function notifyUser(userId, payload) {
  sendToUser(userId, payload).catch((err) => {
    logger.warn(`Push notification error: ${err.message}`);
  });
}

module.exports = { sendToUser, notifyUser };
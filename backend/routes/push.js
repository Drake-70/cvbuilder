const express = require('express');
const requireAuth = require('../middleware/requireAuth');
const PushSubscription = require('../models/PushSubscription');
const pushConfig = require('../config/push');
const { sendToUser } = require('../services/pushService');

const router = express.Router();

/**
 * The VAPID public key. Fetched before `pushManager.subscribe()`, which requires
 * it. Unauthenticated so the frontend can check support on load, but it is a
 * public key by definition — nothing here is secret.
 */
router.get('/public-key', (req, res) => {
  const key = pushConfig.publicKey();
  if (!key) {
    return res.status(503).json({ error: 'Push notifications are not configured on this server' });
  }
  res.json({ publicKey: key });
});

router.post('/subscribe', requireAuth, async (req, res, next) => {
  try {
    const { endpoint, keys } = req.body || {};
    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      return res.status(400).json({ error: 'endpoint and keys.p256dh/keys.auth are required' });
    }

    // endpoint is globally unique, so an upsert on it re-binds a subscription
    // that moved between accounts (e.g. shared device, or the user signed in as
    // someone else) instead of colliding on the unique index.
    await PushSubscription.findOneAndUpdate(
      { endpoint },
      {
        $set: {
          userId: req.user._id,
          keys: { p256dh: keys.p256dh, auth: keys.auth },
          userAgent: String(req.get('user-agent') || '').slice(0, 300)
        }
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    res.status(201).json({ subscribed: true });
  } catch (err) {
    next(err);
  }
});

router.post('/unsubscribe', requireAuth, async (req, res, next) => {
  try {
    const { endpoint } = req.body || {};
    if (!endpoint) return res.status(400).json({ error: 'endpoint is required' });

    // Scoped to req.user so one account cannot remove another's subscription.
    const result = await PushSubscription.deleteOne({ endpoint, userId: req.user._id });
    res.json({ unsubscribed: result.deletedCount > 0 });
  } catch (err) {
    next(err);
  }
});

router.get('/status', requireAuth, async (req, res, next) => {
  try {
    const count = await PushSubscription.countDocuments({ userId: req.user._id });
    res.json({ enabled: pushConfig.isConfigured(), devices: count });
  } catch (err) {
    next(err);
  }
});

// Test endpoint: confirms the full path (VAPID auth + push service reachability)
// without waiting for a real notification to be generated.
router.post('/test', requireAuth, async (req, res, next) => {
  try {
    const result = await sendToUser(req.user._id, {
      title: 'CVBoost notifications are on',
      body: 'You will be notified when new jobs match your alerts.',
      link: '/jobs',
      tag: 'cvboost-test'
    });
    res.json({ ...result, configured: pushConfig.isConfigured() });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
/**
 * Web Push (VAPID) configuration.
 *
 * VAPID is what lets a push service accept messages from this server: an
 * application-server key pair, plus a contact address operators can reach if
 * something goes wrong. Both keys must be stable across deploys — rotating them
 * silently invalidates every existing browser subscription, so treat
 * VAPID_PRIVATE_KEY as permanent.
 *
 * Deliberately required rather than defaulted. Generating a throwaway pair on
 * boot would look like it worked while breaking every existing subscription on
 * each restart, which is far worse than a loud failure at first use.
 */

const webpush = require('web-push');
const logger = require('../utils/logger');

const PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const SUBJECT = process.env.VAPID_SUBJECT || 'mailto:admin@cvboost.app';

let configured = null;
let warned = false;

function isConfigured() {
  if (configured !== null) return configured;
  configured = Boolean(PUBLIC_KEY && PRIVATE_KEY);
  if (!configured && !warned) {
    warned = true;
    logger.warn('VAPID keys not set — web push is disabled (set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY)');
  }
  return configured;
}

function setDetails() {
  if (!isConfigured()) return false;
  webpush.setVapidDetails(SUBJECT, PUBLIC_KEY, PRIVATE_KEY);
  return true;
}

/** Public key for the browser. Safe to expose; the private key never leaves the server. */
function publicKey() {
  return PUBLIC_KEY || null;
}

module.exports = { isConfigured, setDetails, publicKey, webpush, SUBJECT };
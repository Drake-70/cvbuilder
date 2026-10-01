const mongoose = require('mongoose');
const logger = require('../utils/logger');

// Driver-level failures worth retrying: a paused free-tier cluster, a dropped
// socket, a cold start that outlasts serverSelectionTimeoutMS.
//
// These are matched on the driver's own class name. Mongoose wraps several of
// them in errors of its own that differ only by a `Mongoose` prefix, and the
// unprefixed spelling did not match — so a server-selection failure (precisely
// what a paused Atlas cluster produces) was treated as fatal and the process
// exited on the first attempt instead of waiting for the cluster to wake.
const RETRYABLE = new Set([
  'ServerSelectionError',
  'NetworkError',
  'TimeoutError',
  'NotConnectedError',
  'MongoServerSelectionError',
  'MongoNetworkError',
  'MongoTimeoutError',
  'MongoNotConnectedError',
  'PoolClearedError'
]);

/** True when `err` is a transient connection failure rather than a bad config. */
function isRetryable(err) {
  const name = (err && err.name) || '';
  return RETRYABLE.has(name) || RETRYABLE.has(name.replace(/^Mongoose/, ''));
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Connect to MongoDB with bounded retries.
 *
 * A single `process.exit(1)` on the first failure turned any transient Atlas
 * blip into a crash-restart loop. Retry the transient classes a few times, then
 * throw: the caller keeps the process alive (the HTTP port is already open) and
 * retries in the background, so a cold or paused cluster is a log line rather
 * than an opaque "Application exited early".
 */
const connectDB = async ({ attempts = 5, delayMs = 3000, serverSelectionTimeoutMS = 10000 } = {}) => {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('MONGODB_URI is not set');
  }

  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const conn = await mongoose.connect(uri, {
        serverSelectionTimeoutMS,
        connectTimeoutMS: serverSelectionTimeoutMS,
        socketTimeoutMS: 45000,
        retryWrites: true
      });
      logger.info(`MongoDB connected: ${conn.connection.host}`);
      return conn;
    } catch (err) {
      lastError = err;
      const retryable = isRetryable(err);
      logger.warn(
        `MongoDB connection attempt ${attempt}/${attempts} failed: ${err.message}`
        + (retryable && attempt < attempts ? ' — retrying' : '')
      );
      if (!retryable || attempt === attempts) break;
      await sleep(delayMs * attempt);
    }
  }

  throw new Error(
    `MongoDB connection failed after ${attempts} attempt(s): ${lastError && lastError.message}`
  );
};

module.exports = connectDB;

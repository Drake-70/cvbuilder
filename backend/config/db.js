const mongoose = require('mongoose');
const logger = require('../utils/logger');

const RETRYABLE = new Set([
  'MongoServerSelectionError',
  'MongoNetworkError',
  'MongoTimeoutError',
  'MongoNotConnectedError'
]);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Connect to MongoDB with bounded retries.
 *
 * A single `process.exit(1)` on the first failure turned any transient Atlas
 * blip into a crash-restart loop, and because the HTTP port only opened after
 * this resolved, every failure also looked to the platform's health checker
 * like a dead instance. Retry the transient classes a few times, then fail.
 */
const connectDB = async ({ attempts = 5, delayMs = 3000 } = {}) => {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    logger.error('MONGODB_URI is not set — cannot start');
    process.exit(1);
  }

  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const conn = await mongoose.connect(uri, {
        serverSelectionTimeoutMS: 10000,
        connectTimeoutMS: 10000,
        socketTimeoutMS: 45000,
        retryWrites: true
      });
      logger.info(`MongoDB connected: ${conn.connection.host}`);
      return conn;
    } catch (err) {
      lastError = err;
      const retryable = RETRYABLE.has(err.name);
      logger.warn(
        `MongoDB connection attempt ${attempt}/${attempts} failed: ${err.message}`
        + (retryable && attempt < attempts ? ' — retrying' : '')
      );
      if (!retryable || attempt === attempts) break;
      await sleep(delayMs * attempt);
    }
  }

  logger.error(`MongoDB connection failed after ${attempts} attempt(s): ${lastError && lastError.message}`);
  process.exit(1);
};

module.exports = connectDB;

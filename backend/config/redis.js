const Redis = require('ioredis');
const logger = require('../utils/logger');

/**
 * Optional Redis (Upstash in production).
 *
 * Redis backs three things that otherwise live in per-process memory: the
 * response cache, the express-rate-limit counters, and the job-scrape lock.
 * In-memory versions are not wrong on a single instance, but every deploy,
 * crash or Render restart silently empties them — which resets a rate-limit
 * budget and lets two instances scrape the same boards at the same time.
 *
 * Redis is strictly optional. With REDIS_URL unset the app boots exactly as
 * before, and every consumer falls back to its in-process implementation. That
 * keeps the local dev loop dependency-free and means a Redis outage degrades
 * cache hit rate instead of taking the site down.
 *
 * Connections are deliberately impatient: maxRetriesPerRequest 1 with the
 * offline queue disabled makes a command fail immediately while disconnected,
 * so callers fall back instead of stacking requests behind a dead socket.
 * ioredis is left to reconnect in the background with a capped backoff.
 */

const REDIS_URL = process.env.REDIS_URL || '';

let client = null;
let configured = false;

const ERROR_LOG_INTERVAL_MS = 60 * 1000;
let lastErrorLogAt = 0;

/**
 * Log at most one Redis failure a minute. A Redis outage produces one error per
 * attempted command; without this the log would be unusable and would itself
 * become the incident.
 */
function noteError(err) {
  const now = Date.now();
  if (now - lastErrorLogAt < ERROR_LOG_INTERVAL_MS) return;
  lastErrorLogAt = now;
  logger.warn(`[redis] unavailable, using in-process state: ${err.message}`);
}

if (REDIS_URL) {
  configured = true;

  client = new Redis(REDIS_URL, {
    // Fail fast rather than queue work behind a socket that may never open.
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    connectTimeout: 5000,
    // Capped backoff so a long outage does not turn into a reconnect storm.
    retryStrategy: (attempt) => Math.min(attempt * 500, 30000),
    // Managed Redis drops idle connections; these keep the socket warm and are
    // supported by Upstash.
    keepAlive: 10000
  });

  client.on('ready', () => {
    logger.info('[redis] connected');
  });
  client.on('error', noteError);
} else {
  logger.info('[redis] REDIS_URL not set — cache, rate-limit counters and scrape lock stay in-process');
}

/** True when REDIS_URL is set, regardless of whether the socket is up yet. */
function isConfigured() {
  return configured;
}

/**
 * True when Redis is configured *and* the connection is usable right now.
 *
 * Callers use this to choose a backend per operation, so it must reflect the
 * live socket rather than the configuration: reporting "yes" during a reconnect
 * would route every request through a failing command.
 */
function isReady() {
  return configured && Boolean(client) && client.status === 'ready';
}

function getClient() {
  return client;
}

module.exports = {
  isConfigured,
  isReady,
  getClient,
  noteError
};

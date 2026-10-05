const kpi = require('../services/kpi');
const metrics = require('../services/metrics');
const redis = require('../config/redis');
const mongoose = require('mongoose');
const logger = require('../utils/logger');

/**
 * Admin KPI and health endpoints.
 *
 * Separate from `adminController` because this is a different concern: that file
 * holds list-and-toggle handlers for entities an admin browses, and this holds
 * aggregations. They share a route file and an `requireAdmin` guard, not a module.
 */

/**
 * Time series, funnel, engagement, and period-over-period deltas.
 *
 * `days` is the only parameter. It is clamped inside `services/kpi`, so there is no
 * way to ask this endpoint for an unbounded scan.
 */
async function getKpis(req, res, next) {
  try {
    res.json(await kpi.kpiSummary(req.query));
  } catch (err) {
    next(err);
  }
}

/**
 * Live service health.
 *
 * Assembled from three sources that know things the others do not:
 *
 * - `services/metrics` has request counts, error rate and latency, but only for
 *   this process and only since it started.
 * - Redis and Mongoose know whether the data layer is actually reachable, which is
 *   the question that matters most and the one request metrics cannot answer.
 * - `process` knows memory and uptime.
 *
 * Each is reported with its own scope attached. A "healthy" badge with no scope is
 * worse than no badge, because it invites someone to quote a per-process memory
 * figure as the health of a fleet.
 */
async function getHealth(req, res, next) {
  try {
    // Probed rather than read from connection state: a driver can report `connected`
    // while the server it is pointed at has gone away. A 1s ping is the cheapest way
    // to tell the difference, and this endpoint is not hot enough to care.
    const mongoOk = mongoose.connection.readyState === 1;
    let mongoError = null;
    if (mongoOk) {
      try {
        await mongoose.connection.db.admin().ping();
      } catch (err) {
        mongoError = err.message;
      }
    }

    const redisConfigured = redis.isConfigured();
    const redisState = redisConfigured ? redis.status() : { ok: false, state: 'not-configured' };

    const snapshot = metrics.snapshot();

    // A single overall verdict, derived rather than hand-set, so it cannot drift from
    // the parts. Deliberately only about the data layer and live error rate: a slow
    // p99 is not an outage, and folding it in would page someone for a latency blip.
    const errorRateHigh = snapshot.totals.requests >= 20 && snapshot.totals.errorRate >= 0.05;
    const healthy = mongoOk && !mongoError && (!redisConfigured || redisState.ok) && !errorRateHigh;

    res.json({
      status: healthy ? 'ok' : 'degraded',
      checkedAt: new Date().toISOString(),
      dependencies: {
        mongo: {
          ok: mongoOk && !mongoError,
          // readyState 1 is "connected"; the raw value is passed through because
          // "disconnected" and "connecting" call for different responses.
          readyState: mongoose.connection.readyState,
          error: mongoError
        },
        redis: {
          ok: Boolean(redisState.ok),
          state: redisState.state || 'unknown',
          error: redisState.error || null,
          configured: redisConfigured,
          // What the app does without it: cache, rate limits and the scrape lock all
          // degrade to in-process, which is a real operational difference rather than
          // a cosmetic one.
          impact: redisConfigured ? null : 'Cache, rate limits and the scrape lock are in-process.'
        }
      },
      requests: snapshot,
      // Present so a future reader knows what this number does not cover.
      scope: snapshot.scope
    });
  } catch (err) {
    // A failure to assemble the health report is itself the health news, so it is
    // logged rather than swallowed into a 200 with empty fields.
    logger.error(`admin health report failed: ${err.message}`);
    next(err);
  }
}

module.exports = { getKpis, getHealth };
const crypto = require('crypto');
const logger = require('../utils/logger');
const redis = require('../config/redis');
const User = require('../models/User');
const Notification = require('../models/Notification');
const Job = require('../models/Job');
const { sendDailyDigestEmail } = require('./emailService');

/**
 * The daily job digest.
 *
 * The alert matcher already mails a user the moment a listing matches, and already
 * writes a Notification row for it. This adds the other cadence users actually ask
 * for: one email a day summarising everything that matched, which is easier to act
 * on than a trickle of individual alerts and easier to ignore than neither.
 *
 * Three properties are load-bearing:
 *
 *  - **Once per user per day, not once per scrape.** Scraping runs every six hours.
 *    Without a per-user timestamp on the user document, every scrape would send
 *    four digests. The timestamp is in the database rather than in memory so a
 *    restart, a Render deploy, or a second instance cannot each decide it is the
 *    first of the day.
 *
 *  - **Built from Notifications, not from a second matching pass.** The set of
 *    Notifications of type job_alert since the last digest is precisely the set the
 *    user has already been notified about in-app. Re-deriving matches here would add
 *    a second implementation of alertMatches to keep in step with the first, and the
 *    two would eventually disagree about what the user was told.
 *
 *  - **lastDigestAt moves only on success.** A user whose send failed is retried on
 *    the next cycle, because leaving the timestamp alone keeps their window open.
 *    Moving it on failure would drop those matches on the floor permanently.
 */

const DIGEST_LOCK_KEY = 'cvboost:jobs:digest-lock';
const DIGEST_LOCK_TTL_MS = 10 * 60 * 1000;

// 23 hours, not 24. A scrape six hours after the digest would find the last one
// only 18 hours old at the earliest boundary and skip, so a strict 24 could leave
// a user waiting a full extra cycle for no benefit. The gap still keeps any drift
// in the scrape cadence from turning into more than one digest a day.
const MIN_INTERVAL_MS = 23 * 60 * 60 * 1000;

// A ceiling on how far back the window reaches. Without it, a user whose alerts
// match nothing for a month then matches three jobs gets one email containing a
// month of everything, which reads as spam and is the kind of surprise that gets
// the whole feature turned off.
const MAX_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

// What the email actually lists. The count above this is stated in the body.
const DIGEST_JOB_LIMIT = 15;

// Notifications examined per user before the list is truncated. The email reports
// totalMatched as the number of listings it can actually show, so this only bounds
// the work done per user; a user with more than this still gets a digest, it just
// does not itemise all of them.
const DIGEST_SCAN_LIMIT = 200;

// Guards against a pathological row count, not a quota. A user base in the
// thousands is served in batches on consecutive cycles rather than skipped.
const USER_BATCH = 500;

let inFlight = false;

const RELEASE_LOCK_LUA =
  'if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end';

/**
 * Take the digest lock.
 *
 * Separate from the scrape lock on purpose. The digest runs after the scrape lock
 * has been released, so reusing that key would be meaningless, and it needs its own
 * because it does different work and holds a different resource (an outbound email
 * per opted-in user) for a different amount of time.
 */
async function acquireDigestLock() {
  if (inFlight) return { acquired: false, token: null };

  const token = crypto.randomUUID();
  inFlight = true;

  if (redis.isReady()) {
    try {
      const reply = await redis
        .getClient()
        .set(DIGEST_LOCK_KEY, token, 'PX', DIGEST_LOCK_TTL_MS, 'NX');
      if (reply !== 'OK') {
        inFlight = false;
        return { acquired: false, token: null };
      }
      return { acquired: true, token };
    } catch (err) {
      // Fail open for the same reason the scrape lock does: a Redis blip must not
      // stop users getting their digest. The in-process flag still prevents overlap
      // within this instance, which is the case that would double-send.
      redis.noteError(err);
    }
  }

  return { acquired: true, token };
}

async function releaseDigestLock(token) {
  inFlight = false;
  if (!token || !redis.isReady()) return;
  try {
    await redis.getClient().eval(RELEASE_LOCK_LUA, 1, DIGEST_LOCK_KEY, token);
  } catch (err) {
    redis.noteError(err);
  }
}

/**
 * Which users this cycle should consider.
 *
 * Verified-only because an unverified address is one nobody asked to mail, and the
 * dashboard is gated on verification anyway, so an unverified user with alerts
 * configured is not a state the app otherwise supports.
 */
async function findDigestUsers(after) {
  // The cursor filter is omitted on the first batch rather than sent as `$gt: null`.
  // Mongoose casts that against the ObjectId path, and a null cast is not a reliable
  // "match everything" -- BSON orders Null below ObjectId, but relying on that to get
  // the first batch is a dependency on comparison rules rather than on intent.
  const filter = after ? { dailyDigest: true, emailVerified: true, _id: { $gt: after } }
                       : { dailyDigest: true, emailVerified: true };
  return User.find(filter).sort({ _id: 1 }).limit(USER_BATCH).lean();
}

/**
 * The window to scan for one user.
 *
 * Starts at the last digest that actually went out, or 24 hours ago for a user who
 * has never received one. Never reaches back further than MAX_WINDOW_MS.
 */
function windowStartFor(user, now) {
  const base = user.lastDigestAt ? new Date(user.lastDigestAt).getTime() : now - 24 * 60 * 60 * 1000;
  const earliest = now - MAX_WINDOW_MS;
  return new Date(Math.max(base, earliest));
}

function isDue(user, now) {
  if (!user.lastDigestAt) return true;
  return now - new Date(user.lastDigestAt).getTime() >= MIN_INTERVAL_MS;
}

/**
 * The jobs behind a set of alert notifications.
 *
 * Returns rows in notification order (newest first) rather than in Job order, so
 * the digest reads newest-first. Notifications pointing at a job that has since been
 * deleted outright are dropped -- there is nothing to link to, unlike an expired
 * listing, which is kept and labelled.
 */
async function resolveJobs(notifications) {
  const ids = [...new Set(notifications.map((n) => String(n.jobId)).filter(Boolean))];
  if (!ids.length) return { jobs: [], missing: 0 };

  const rows = await Job.find({ _id: { $in: ids } }).lean();
  const byId = new Map(rows.map((j) => [String(j._id), j]));

  const jobs = [];
  const seen = new Set();
  let missing = 0;
  for (const n of notifications) {
    const key = String(n.jobId);
    // Deduplicated on job id, because the alert matcher only prevents a second
    // notification for the same user and job while that check is in force -- a job
    // that matched twice inside one window can still appear twice here, and a digest
    // listing the same posting twice reads as a bug in the digest.
    if (seen.has(key)) continue;
    const job = byId.get(key);
    if (!job) {
      missing += 1;
      continue;
    }
    seen.add(key);
    jobs.push(job);
  }
  return { jobs, missing };
}

/**
 * Send one user's digest. Returns a reason string on every path so the caller can
 * report why a user was skipped without re-deriving it.
 */
async function sendDigestForUser(user, now) {
  const windowStart = windowStartFor(user, now);

  const notifications = await Notification.find({
    userId: user._id,
    type: 'job_alert',
    createdAt: { $gte: windowStart }
  })
    .sort({ createdAt: -1 })
    .limit(DIGEST_SCAN_LIMIT)
    .lean();

  if (!notifications.length) return 'no-matches';

  const { jobs, missing } = await resolveJobs(notifications);

  if (!jobs.length) {
    // Matched, but every referenced listing has been deleted. Worth its own line:
    // it means the board is being emptied underneath the alerts, not that alerts
    // stopped matching.
    logger.warn(
      `[digest] ${user.email}: ${notifications.length} matched notification(s) but no listing could be resolved (${missing} missing)`
    );
    return 'missing-jobs';
  }

  const shown = jobs.slice(0, DIGEST_JOB_LIMIT);
  const result = await sendDailyDigestEmail({
    email: user.email,
    name: user.name,
    language: user.preferredLanguage === 'fr' ? 'fr' : 'en',
    jobs: shown,
    totalMatched: jobs.length
  });

  if (!result || result.success === false) {
    // lastDigestAt is deliberately left alone so the window stays open and the next
    // cycle retries these same matches.
    logger.error(
      `[digest] ${user.email}: send failed (${(result && result.error) || 'unknown error'}) - will retry next cycle`
    );
    return 'failed';
  }

  await User.updateOne({ _id: user._id }, { $set: { lastDigestAt: new Date(now) } });

  return result.consoleOnly ? 'sent-console' : 'sent';
}

/**
 * Run one digest cycle. Safe to call from any trigger.
 *
 * Never throws for a per-user problem: one bad address must not stop the digest
 * reaching the other users, since the alternative is that a single Brevo rejection
 * silently stops the feature for everyone behind them in the batch.
 */
async function runDailyDigest() {
  const { acquired, token } = await acquireDigestLock();
  if (!acquired) {
    logger.info('[digest] skipped - another instance is already running the digest');
    return { skipped: true, locked: true, users: 0, sent: 0 };
  }

  const summary = {
    skipped: false,
    locked: false,
    users: 0,
    sent: 0,
    consoleOnly: 0,
    noMatches: 0,
    missingJobs: 0,
    failed: 0,
    notDue: 0
  };

  try {
    const now = Date.now();
    const optedIn = await User.countDocuments({ dailyDigest: true, emailVerified: true });

    if (!optedIn) {
      // Said out loud for the same reason the alert matcher says it: a summary of
      // zeroes and silence are not distinguishable from the outside.
      logger.info('[digest] no user has the daily digest turned on, so nothing was sent');
      return summary;
    }

    let after = null;
    for (;;) {
      const batch = await findDigestUsers(after);
      if (!batch.length) break;

      after = batch[batch.length - 1]._id;
      summary.users += batch.length;

      // One at a time, deliberately. Brevo rate-limits the transactional API, and a
      // digest is not a message anyone is watching for in real time -- so a burst
      // that trips a 429 would trade a slower digest for a much worse failure mode,
      // where half the recipients get nothing and the retries compound. Sequential
      // keeps the request rate inside any sane quota without a queue.
      for (const user of batch) {
        if (!isDue(user, now)) {
          summary.notDue += 1;
          continue;
        }
        let outcome;
        try {
          outcome = await sendDigestForUser(user, now);
        } catch (err) {
          logger.error(`[digest] ${user.email}: unexpected failure - ${err.message}`);
          summary.failed += 1;
          continue;
        }
        if (outcome === 'sent') summary.sent += 1;
        else if (outcome === 'sent-console') {
          summary.sent += 1;
          summary.consoleOnly += 1;
        } else if (outcome === 'no-matches') summary.noMatches += 1;
        else if (outcome === 'missing-jobs') summary.missingJobs += 1;
        else if (outcome === 'failed') summary.failed += 1;
      }

      if (batch.length < USER_BATCH) break;
    }

    logger.info(
      `[digest] ${summary.sent} sent to ${summary.users} opted-in user(s) ` +
      `(${summary.notDue} not due yet, ${summary.noMatches} had no new matches, ` +
      `${summary.missingJobs} matched nothing resolvable, ${summary.failed} failed)` +
      (summary.consoleOnly ? ` [${summary.consoleOnly} logged only - no email transport configured]` : '')
    );

    return summary;
  } finally {
    await releaseDigestLock(token);
  }
}

module.exports = {
  runDailyDigest,
  sendDigestForUser,
  isDue,
  windowStartFor,
  MIN_INTERVAL_MS,
  MAX_WINDOW_MS,
  DIGEST_JOB_LIMIT,
  DIGEST_SCAN_LIMIT
};
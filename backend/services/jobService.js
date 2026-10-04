const JobAlert = require('../models/JobAlert');
const Notification = require('../models/Notification');
const User = require('../models/User');
const { sendJobAlertEmail } = require('./emailService');
const logger = require('../utils/logger');
const { sendToUser } = require('./pushService');

function textMatchesKeywords(text, keywords) {
  const blob = text.toLowerCase();
  return keywords.some((k) => k && blob.includes(k.toLowerCase().trim()));
}

function locationMatches(jobLocation, locations) {
  const loc = (jobLocation || '').toLowerCase();
  return locations.some((l) => l && (loc === '' || loc.includes(l.toLowerCase().trim())));
}

function alertMatches(alert, job) {
  if (alert.keywords && alert.keywords.length && !textMatchesKeywords(`${job.title} ${job.company} ${job.description}`, alert.keywords)) {
    return false;
  }
  if (alert.locations && alert.locations.length && !locationMatches(job.location, alert.locations)) {
    return false;
  }
  if (alert.categories && alert.categories.length && !alert.categories.includes(job.category)) {
    return false;
  }
  return true;
}

async function createNotification({ userId, type, title, body, jobId = null, link = '' }) {
  return Notification.create({ userId, type, title, body, jobId, link });
}

/**
 * The shape every non-matching outcome returns.
 *
 * Named rather than repeated because the alternative already shipped: two of the
 * three early returns were missing `pushes`, so a caller reading `result.pushes` got
 * undefined on the quiet paths and a number on the busy ones -- a value that means
 * "nothing" and "not computed" at once, and only differs when someone is already
 * looking.
 */
function emptyMatch(extra = {}) {
  return { notifications: 0, emails: 0, pushes: 0, alerts: 0, matched: 0, alreadyNotified: 0, ...extra };
}

async function matchAlertsForJobs(jobs) {
  const jobCount = jobs && jobs.length ? jobs.length : 0;
  if (!jobCount) {
    logger.info('[jobs] alert matching skipped: no active listings to match against');
    return emptyMatch({ skipped: true });
  }

  const alerts = await JobAlert.find({ active: true }).lean();
  if (!alerts.length) {
    // Said out loud. Silence here is indistinguishable from a scrape that found
    // nothing, and "alerts matched 0" reads like a broken matcher rather than an
    // empty table -- which is how a real failure gets mistaken for a quiet night.
    logger.info('[jobs] no active job alerts configured, so nothing was matched');
    return emptyMatch();
  }

  const emailsToSend = new Map();
  const users = new Map();
  const userIds = [...new Set(alerts.map((a) => a.userId.toString()))];
  for (const id of userIds) {
    const user = await User.findById(id).select('email preferredLanguage').lean();
    if (user) users.set(id, user);
  }

  // Collected per user rather than sent inline: one push per user summarising
  // the cycle, instead of one push per matched job, which would flood a phone.
  const jobsToPush = new Map();

  let created = 0;
  let matched = 0;
  let alreadyNotified = 0;
  for (const job of jobs) {
    for (const alert of alerts) {
      if (!alertMatches(alert, job)) continue;
      matched += 1;
      const exists = await Notification.exists({ userId: alert.userId, jobId: job._id, type: 'job_alert' });
      // Counted rather than silently skipped. A scrape that finds six matches and
      // notifies nobody has found them again, and the difference between that and
      // "nothing matched" is the difference between a working dedupe and a broken
      // one -- invisible unless both numbers are logged.
      if (exists) {
        alreadyNotified += 1;
        continue;
      }

      await Notification.create({
        userId: alert.userId,
        type: 'job_alert',
        title: job.title,
        body: `${job.company || 'Unknown company'} — ${job.location || 'Cameroon'}`,
        jobId: job._id,
        link: `/jobs/${job._id}`
      });
      created += 1;

      const pushKey = alert.userId.toString();
      if (!jobsToPush.has(pushKey)) jobsToPush.set(pushKey, { userId: alert.userId, jobs: [] });
      const pushList = jobsToPush.get(pushKey).jobs;
      if (!pushList.some((j) => j._id.equals(job._id))) pushList.push(job);

      await JobAlert.updateOne({ _id: alert._id }, { $set: { lastMatchedAt: new Date() } });

      if (alert.emailEnabled) {
        const key = alert.userId.toString();
        if (!emailsToSend.has(key)) emailsToSend.set(key, []);
        const list = emailsToSend.get(key);
        if (!list.some((j) => j._id.equals(job._id))) list.push(job);
      }
    }
  }

  let pushes = 0;
  for (const { userId, jobs: matched } of jobsToPush.values()) {
    const first = matched[0];
    const result = await sendToUser(userId, {
      title: matched.length === 1
        ? `New job: ${first.title}`
        : `${matched.length} new jobs match your alerts`,
      body: matched.length === 1
        ? `${first.company || 'Unknown company'} — ${first.location || 'Cameroon'}`
        : matched.slice(0, 3).map((j) => j.title).join(' · '),
      link: `/jobs/${first._id}`,
      // One notification per user per cycle: a matching tag collapses repeats.
      tag: `job-alert-${userId}`
    });
    pushes += result.sent;
  }

  let sent = 0;
  for (const [userId, jobsForEmail] of emailsToSend.entries()) {
    const user = users.get(userId);
    if (!user) continue;
    const result = await sendJobAlertEmail({
      email: user.email,
      language: user.preferredLanguage || 'en',
      jobs: jobsForEmail.slice(0, 8)
    });
    if (result && !result.consoleOnly) sent += 1;
  }

  // Every number that decides whether this is working, including the two that are
  // otherwise indistinguishable: alerts considered, listings considered, and matches
  // found before the dedupe.
  logger.info(
    `[jobs] alerts: ${alerts.length} active against ${jobCount} listing(s) -- ` +
    `${matched} matched, ${alreadyNotified} already notified, ` +
    `${created} new notification(s), ${sent} email(s), ${pushes} push(es)`
  );
  return { notifications: created, emails: sent, pushes, alerts: alerts.length, matched, alreadyNotified };
}

async function runScrapeCycle() {
  const { scrapeAll, expireStaleJobs } = require('./jobScraper');
  const { invalidateCache } = require('../middleware/cache');
  const Job = require('../models/Job');

  const cycle = await scrapeAll();

  // A duplicate trigger was suppressed; report it without touching the DB.
  if (cycle.skipped) {
    return {
      alreadyRunning: true,
      startedAt: cycle.startedAt,
      results: [],
      matched: { notifications: 0, emails: 0, pushes: 0, alerts: 0, matched: 0, skipped: true }
    };
  }

  // Runs after the upserts so a listing that is still on its source board has
  // already had `scrapedAt` refreshed and cannot be expired in the same pass.
  // Failure here must not lose a good scrape, so it degrades to a warning.
  let expiry = { expired: 0, skipped: true };
  try {
    expiry = await expireStaleJobs();
  } catch (err) {
    logger.warn(`[jobs] expiry sweep failed: ${err.message}`);
  }

  // Listings are cached for 60s, so a scrape that just landed would otherwise
  // stay invisible until the TTL expired.
  invalidateCache('/api/jobs');

  const since = new Date(Date.now() - 10 * 60 * 1000);
  const recentJobs = await Job.find({ scrapedAt: { $gte: since }, active: true }).limit(300).lean();
  const matched = await matchAlertsForJobs(recentJobs);

  // Runs last, and reads only what the two steps above wrote, so the digest
  // summarises a scrape that has actually landed rather than the previous one.
  //
  // Placed here rather than in the scheduler so all three triggers get it: the
  // in-process timer, the GitHub Actions cron, and the admin button. Each one
  // throttles independently through the recipient's lastDigestAt, and takes its own
  // lock, so a second trigger arriving mid-digest cannot double-send.
  //
  // Failure is swallowed deliberately. A scrape is worth having even when the
  // digest is not, and a Brevo outage turning every scrape into an error would
  // hide the part that matters.
  let digest = { skipped: true, error: 'not run' };
  try {
    const { runDailyDigest } = require('./digestService');
    digest = await runDailyDigest();
  } catch (err) {
    logger.warn(`[digest] cycle failed: ${err.message}`);
    digest = { skipped: true, error: err.message };
  }

  // `expiry` is surfaced so the number of listings aged out is visible in the
  // scrape response and the GitHub Actions log rather than only in a debug line.
  return { ...cycle, matched, expiry, digest };
}

module.exports = { createNotification, matchAlertsForJobs, alertMatches, runScrapeCycle };

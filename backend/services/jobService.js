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

async function matchAlertsForJobs(jobs) {
  if (!jobs || !jobs.length) return { notifications: 0, emails: 0 };

  const alerts = await JobAlert.find({ active: true }).lean();
  if (!alerts.length) return { notifications: 0, emails: 0 };

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
  for (const job of jobs) {
    for (const alert of alerts) {
      if (!alertMatches(alert, job)) continue;
      const exists = await Notification.exists({ userId: alert.userId, jobId: job._id, type: 'job_alert' });
      if (exists) continue;

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

  logger.info(`[jobs] alerts matched ${created} new notification(s), ${sent} email(s), ${pushes} push(es)`);
  return { notifications: created, emails: sent, pushes };
}

async function runScrapeCycle() {
  const { scrapeAll, expireStaleJobs } = require('./jobScraper');
  const { invalidateCache } = require('../middleware/cache');
  const Job = require('../models/Job');

  const cycle = await scrapeAll();

  // A duplicate trigger was suppressed; report it without touching the DB.
  if (cycle.skipped) {
    return { alreadyRunning: true, startedAt: cycle.startedAt, results: [], matched: { notifications: 0, emails: 0 } };
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
  // `expiry` is surfaced so the number of listings aged out is visible in the
  // scrape response and the GitHub Actions log rather than only in a debug line.
  return { ...cycle, matched, expiry };
}

module.exports = { createNotification, matchAlertsForJobs, alertMatches, runScrapeCycle };

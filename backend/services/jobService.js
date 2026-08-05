const JobAlert = require('../models/JobAlert');
const Notification = require('../models/Notification');
const User = require('../models/User');
const { sendJobAlertEmail } = require('./emailService');
const logger = require('../utils/logger');

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

      await JobAlert.updateOne({ _id: alert._id }, { $set: { lastMatchedAt: new Date() } });

      if (alert.emailEnabled) {
        const key = alert.userId.toString();
        if (!emailsToSend.has(key)) emailsToSend.set(key, []);
        const list = emailsToSend.get(key);
        if (!list.some((j) => j._id.equals(job._id))) list.push(job);
      }
    }
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

  logger.info(`[jobs] alerts matched ${created} new notification(s), ${sent} email(s)`);
  return { notifications: created, emails: sent };
}

async function runScrapeCycle() {
  const { scrapeAll } = require('./jobScraper');
  const Job = require('../models/Job');

  const results = await scrapeAll();
  const since = new Date(Date.now() - 10 * 60 * 1000);
  const recentJobs = await Job.find({ scrapedAt: { $gte: since }, active: true }).limit(300).lean();
  const matched = await matchAlertsForJobs(recentJobs);
  return { results, matched };
}

module.exports = { createNotification, matchAlertsForJobs, alertMatches, runScrapeCycle };

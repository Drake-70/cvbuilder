const Job = require('../models/Job');
const JobAlert = require('../models/JobAlert');
const Notification = require('../models/Notification');
const Application = require('../models/Application');
const CV = require('../models/CV');
const TailoredDocument = require('../models/TailoredDocument');
const User = require('../models/User');
const { tailorCV } = require('../services/aiService');
const { runScrapeCycle } = require('../services/jobService');
const posthog = require('../config/posthog');

const JOB_CATEGORIES = [
  'IT & Software', 'Accounting & Finance', 'Engineering', 'Sales & Marketing',
  'Healthcare', 'Education', 'Administration & HR', 'Logistics & Transport',
  'Hospitality & Tourism', 'Management', 'Other'
];

exports.listJobs = async (req, res, next) => {
  try {
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 20, 1), 50);
    const { q, location, category, source, sort } = req.query;

    const filter = { active: true };
    if (q) filter.$text = { $search: q };
    if (location) filter.location = { $regex: location.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
    if (category) filter.category = category;
    if (source) filter.source = source;

    const sortOptions = sort === 'oldest' ? { postedAt: 1 } : { postedAt: -1, _id: -1 };

    const [jobs, total] = await Promise.all([
      Job.find(filter).sort(sortOptions).skip((page - 1) * limit).limit(limit).lean(),
      Job.countDocuments(filter)
    ]);

    res.json({ jobs, total, page, pages: Math.ceil(total / limit), categories: JOB_CATEGORIES });
  } catch (err) {
    next(err);
  }
};

exports.getJob = async (req, res, next) => {
  try {
    // Expired listings stay readable on purpose: a user who already applied to
    // a job must not have it vanish from under them. The board itself still
    // only lists active jobs, and `expired` tells the client to render it as
    // no longer accepting applications.
    const job = await Job.findById(req.params.id).lean();
    if (!job) return res.status(404).json({ error: 'Job not found' });

    // Only count a view against a listing that is still live.
    if (job.active) {
      Job.updateOne({ _id: job._id }, { $inc: { viewCount: 1 } }).catch(() => {});
    }
    res.json({ job: { ...job, expired: !job.active } });
  } catch (err) {
    next(err);
  }
};

exports.createApplication = async (req, res, next) => {
  try {
    const { jobId, method, cvId, cvText, notes } = req.body;
    if (!jobId) return res.status(400).json({ error: 'Job ID is required' });
    if (!['tailor', 'email', 'link'].includes(method)) {
      return res.status(400).json({ error: 'Invalid application method' });
    }

    const job = await Job.findById(jobId);
    if (!job) return res.status(404).json({ error: 'Job not found' });

    const language = req.user.preferredLanguage || 'en';
    let tailoredDocumentId = null;
    let coverLetter = '';
    let application = await Application.findOne({ userId: req.user._id, jobId: job._id });

    // An expired listing is still readable so existing applicants keep their
    // history, but starting a brand new application to a dead posting would
    // only waste the user's time and spend an AI call. Editing an application
    // they already made is still allowed.
    if (!job.active && !application) {
      return res.status(409).json({ error: 'This listing has expired and is no longer accepting applications' });
    }

    if (method === 'tailor') {
      let cvTextSource = cvText;
      if (!cvTextSource && cvId) {
        const cv = await CV.findOne({ _id: cvId, userId: req.user._id });
        if (cv) cvTextSource = cv.originalText;
      }
      if (!cvTextSource || !cvTextSource.trim()) {
        return res.status(400).json({ error: 'Select a CV or paste your CV text to tailor an application' });
      }

      const jobContext = `${job.title} at ${job.company} (${job.location})\n\n${job.description}`;
      const result = await tailorCV(cvTextSource, jobContext, language);

      const doc = await TailoredDocument.create({
        userId: req.user._id,
        baseCvId: cvId || null,
        jobTitle: job.title,
        jobDescription: jobContext,
        tailoredContent: result.tailoredCV,
        coverLetter: result.coverLetter || '',
        gapAnalysis: result.gapAnalysis || [],
        language,
        template: 'modern',
        applicationStatus: 'applied',
        companyApplied: job.company,
        appliedAt: new Date()
      });
      await User.findByIdAndUpdate(req.user._id, { $inc: { documentsGeneratedCount: 1 } });
      tailoredDocumentId = doc._id;
      coverLetter = result.coverLetter || '';
    }

    if (application) {
      application.method = method;
      application.status = 'applied';
      application.notes = notes || application.notes || '';
      if (cvId) application.cvId = cvId;
      if (tailoredDocumentId) application.tailoredDocumentId = tailoredDocumentId;
      if (coverLetter) application.coverLetter = coverLetter;
      application.appliedAt = new Date();
      await application.save();
    } else {
      application = await Application.create({
        userId: req.user._id,
        jobId: job._id,
        method,
        cvId: cvId || null,
        tailoredDocumentId,
        coverLetter,
        notes: notes || '',
        status: 'applied'
      });
    }

    Job.updateOne({ _id: job._id }, { $inc: { applyCount: 1 } }).catch(() => {});

    await Notification.create({
      userId: req.user._id,
      type: 'application',
      title: job.title,
      body: `Application ${method === 'tailor' ? 'tailored for' : 'sent for'} ${job.company || 'this job'}`,
      jobId: job._id,
      link: `/jobs/${job._id}`
    });

    const payload = { application, method };
    if (method === 'tailor') {
      payload.tailoredDocumentId = tailoredDocumentId;
      payload.coverLetter = coverLetter;
    }
    if (method === 'email') payload.contactEmail = job.contactEmail || '';
    if (method === 'link') payload.applyUrl = job.applyUrl || job.sourceUrl;

    res.status(201).json(payload);

    posthog.captureFor(req, 'job_application_submitted', { method, jobTitle: job.title, source: job.source });
  } catch (err) {
    if (err.message && err.message.includes('JSON')) {
      return res.status(502).json({ error: 'AI returned an invalid response. Please try again.' });
    }
    next(err);
  }
};

exports.listApplications = async (req, res, next) => {
  try {
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const applications = await Application.find({ userId: req.user._id })
      .sort({ createdAt: -1 })
      .skip((page - 1) * 20)
      .limit(20)
      .populate('jobId', 'title company location salary category source sourceUrl active expiredAt')
      .lean();
    res.json({ applications });
  } catch (err) {
    next(err);
  }
};

exports.createAlert = async (req, res, next) => {
  try {
    const { name, keywords, locations, categories, emailEnabled } = req.body;
    const normalizedKeywords = (keywords || []).map((k) => k.trim()).filter(Boolean);
    if (!normalizedKeywords.length) {
      return res.status(400).json({ error: 'At least one keyword is required' });
    }
    const alert = await JobAlert.create({
      userId: req.user._id,
      name: name || normalizedKeywords[0],
      keywords: normalizedKeywords,
      locations: (locations || []).map((l) => l.trim()).filter(Boolean).slice(0, 10),
      categories: (categories || []).filter((c) => JOB_CATEGORIES.includes(c)).slice(0, 5),
      emailEnabled: emailEnabled !== false
    });
    res.status(201).json({ alert });
    posthog.captureFor(req, 'job_alert_created', { keywords: normalizedKeywords.length });
  } catch (err) {
    next(err);
  }
};

exports.listAlerts = async (req, res, next) => {
  try {
    const alerts = await JobAlert.find({ userId: req.user._id }).sort({ createdAt: -1 }).lean();
    res.json({ alerts });
  } catch (err) {
    next(err);
  }
};

exports.updateAlert = async (req, res, next) => {
  try {
    const { name, keywords, locations, categories, emailEnabled, active } = req.body;
    const alert = await JobAlert.findOne({ _id: req.params.id, userId: req.user._id });
    if (!alert) return res.status(404).json({ error: 'Alert not found' });

    const normalizedKeywords = Array.isArray(keywords)
      ? keywords.map((k) => k.trim()).filter(Boolean)
      : undefined;
    if (normalizedKeywords && !normalizedKeywords.length) {
      return res.status(400).json({ error: 'At least one keyword is required' });
    }
    if (normalizedKeywords) alert.keywords = normalizedKeywords;
    if (typeof name === 'string') alert.name = name;
    if (Array.isArray(locations)) alert.locations = locations.map((l) => l.trim()).filter(Boolean).slice(0, 10);
    if (Array.isArray(categories)) alert.categories = categories.filter((c) => JOB_CATEGORIES.includes(c)).slice(0, 5);
    if (typeof emailEnabled === 'boolean') alert.emailEnabled = emailEnabled;
    if (typeof active === 'boolean') alert.active = active;
    await alert.save();
    res.json({ alert });
  } catch (err) {
    next(err);
  }
};

exports.deleteAlert = async (req, res, next) => {
  try {
    const result = await JobAlert.deleteOne({ _id: req.params.id, userId: req.user._id });
    if (!result.deletedCount) return res.status(404).json({ error: 'Alert not found' });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
};

exports.listNotifications = async (req, res, next) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 30, 1), 100);
    const notifications = await Notification.find({ userId: req.user._id })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
    res.json({ notifications });
  } catch (err) {
    next(err);
  }
};

exports.unreadCount = async (req, res, next) => {
  try {
    const count = await Notification.countDocuments({ userId: req.user._id, read: false });
    res.json({ count });
  } catch (err) {
    next(err);
  }
};

exports.markNotificationsRead = async (req, res, next) => {
  try {
    const { id } = req.body;
    const filter = { userId: req.user._id };
    if (id) filter._id = id;
    await Notification.updateMany(filter, { $set: { read: true } });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
};

/**
 * Constant-time string comparison so the shared scrape key cannot be
 * recovered by timing the 403 responses.
 */
function secretsMatch(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

exports.triggerScrape = async (req, res, next) => {
  try {
    const scrapeKey = process.env.JOB_SCRAPE_KEY;
    const presentedKey = req.headers['x-scrape-key'];
    const authorized = Boolean(scrapeKey) && secretsMatch(scrapeKey, presentedKey);
    const isAdmin = Boolean(req.user && req.user.role === 'admin');
    if (!authorized && !isAdmin) {
      return res.status(403).json({ error: 'Not authorized to trigger a scrape' });
    }

    const cycle = await runScrapeCycle();
    if (cycle.alreadyRunning) {
      return res.status(409).json({
        error: 'A scrape is already in progress',
        startedAt: cycle.startedAt
      });
    }
    res.json(cycle);
  } catch (err) {
    next(err);
  }
};

exports.JOB_CATEGORIES = JOB_CATEGORIES;

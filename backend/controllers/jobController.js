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
    const job = await Job.findOne({ _id: req.params.id, active: true }).lean();
    if (!job) return res.status(404).json({ error: 'Job not found' });

    Job.updateOne({ _id: job._id }, { $inc: { viewCount: 1 } }).catch(() => {});
    res.json({ job });
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

    const job = await Job.findOne({ _id: jobId, active: true });
    if (!job) return res.status(404).json({ error: 'Job not found' });

    const language = req.user.preferredLanguage || 'en';
    let tailoredDocumentId = null;
    let coverLetter = '';
    let application = await Application.findOne({ userId: req.user._id, jobId: job._id });

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
      .populate('jobId', 'title company location salary category source sourceUrl active')
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

exports.triggerScrape = async (req, res, next) => {
  try {
    const scrapeKey = process.env.JOB_SCRAPE_KEY;
    const authorized = scrapeKey && req.headers['x-scrape-key'] === scrapeKey;
    const isAdmin = req.user && req.user.role === 'admin';
    if (!authorized && !isAdmin) {
      return res.status(403).json({ error: 'Not authorized to trigger a scrape' });
    }

    const cycle = await runScrapeCycle();
    res.json(cycle);
  } catch (err) {
    next(err);
  }
};

exports.JOB_CATEGORIES = JOB_CATEGORIES;

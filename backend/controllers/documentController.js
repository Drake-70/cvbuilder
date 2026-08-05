const TailoredDocument = require('../models/TailoredDocument');
const User = require('../models/User');
const Notification = require('../models/Notification');
const ShareView = require('../models/ShareView');
const { generateDocx } = require('../services/documentService');
const { generatePdf } = require('../services/pdfService');
const posthog = require('../config/posthog');
const crypto = require('crypto');

const FORMATS = { docx: true, pdf: true };

function normalizeFormat(format) {
  return FORMATS[format] ? format : 'docx';
}

function filenameFor(format, language) {
  const base = language === 'fr' ? 'CV_Adapte' : 'Tailored_CV';
  return `${base}.${format}`;
}

function contentTypeFor(format) {
  return format === 'pdf'
    ? 'application/pdf'
    : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
}

async function consumeCreditOrCheckAccess(userId, documentId) {
  const user = await User.findById(userId);
  if (!user) throw Object.assign(new Error('User not found'), { statusCode: 404 });

  if (user.subscriptionStatus === 'active') return;

  if (user.freeDocumentCredits > 0) {
    await User.findByIdAndUpdate(userId, { $inc: { freeDocumentCredits: -1 } });
    return;
  }

  if (documentId) {
    const doc = await require('../models/TailoredDocument').findById(documentId);
    if (doc && doc.paid) return;
  }

  throw Object.assign(new Error('Payment required. Please subscribe or purchase a download.'), { statusCode: 402 });
}

exports.generateDocument = async (req, res, next) => {
  try {
    const { tailoredCV, coverLetter, language, template, documentId, format } = req.body;

    if (!tailoredCV) {
      return res.status(400).json({ error: 'Tailored CV data is required' });
    }

    await consumeCreditOrCheckAccess(req.user._id, documentId || null);

    const enrichedCV = {
      ...tailoredCV,
      name: tailoredCV?.name || req.user.name || '',
      email: tailoredCV?.email || req.user.email || '',
      phone: tailoredCV?.phone || '',
      location: tailoredCV?.location || ''
    };
    const outFormat = normalizeFormat(format);
    const lang = language || 'en';
    const buffer = outFormat === 'pdf'
      ? await generatePdf(enrichedCV, coverLetter || '', lang, template || 'modern')
      : await generateDocx(enrichedCV, coverLetter || '', lang, template || 'modern');

    res.setHeader('Content-Type', contentTypeFor(outFormat));
    res.setHeader('Content-Disposition', `attachment; filename="${filenameFor(outFormat, lang)}"`);
    res.send(Buffer.from(buffer));
  } catch (err) {
    if (err.statusCode) return res.status(err.statusCode).json({ error: err.message });
    next(err);
  }
};

exports.saveDocument = async (req, res, next) => {
  try {
    const { baseCvId, jobTitle, jobDescription, tailoredContent, coverLetter, gapAnalysis, language, template } = req.body;

    const doc = await TailoredDocument.create({
      userId: req.user._id,
      baseCvId: baseCvId || null,
      jobTitle: jobTitle || '',
      jobDescription: jobDescription || '',
      tailoredContent,
      coverLetter: coverLetter || '',
      gapAnalysis: gapAnalysis || [],
      language: language || 'en',
      template: template || 'modern'
    });

    await User.findByIdAndUpdate(req.user._id, { $inc: { documentsGeneratedCount: 1 } });

    try {
      await Notification.create({
        userId: req.user._id,
        type: 'system',
        title: jobTitle ? `Your tailored CV for "${jobTitle}" is ready` : 'Your tailored CV is ready',
        body: 'Your CV and cover letter have been generated.',
        link: `/documents/${doc._id}`
      });
    } catch {
      // Notification must never break the save flow
    }

    res.status(201).json(doc);

    posthog.captureFor(req, 'document_saved', { language: language || 'en' });
  } catch (err) {
    next(err);
  }
};

exports.listDocuments = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const docs = await TailoredDocument.find({ userId: req.user._id })
      .sort({ createdAt: -1 })
      .skip((page - 1) * 50)
      .limit(50)
      .select('-jobDescription -tailoredContent -coverLetter');
    res.json(docs);
  } catch (err) {
    next(err);
  }
};

exports.getDocument = async (req, res, next) => {
  try {
    const doc = await TailoredDocument.findOne({ _id: req.params.id, userId: req.user._id });
    if (!doc) {
      return res.status(404).json({ error: 'Document not found' });
    }
    res.json(doc);
  } catch (err) {
    next(err);
  }
};

exports.downloadDocument = async (req, res, next) => {
  try {
    const doc = await TailoredDocument.findOne({ _id: req.params.id, userId: req.user._id });
    if (!doc) {
      return res.status(404).json({ error: 'Document not found' });
    }

    await consumeCreditOrCheckAccess(req.user._id, doc._id);

    doc.downloadCount = (doc.downloadCount || 0) + 1;
    await doc.save();

    const enrichedCV = {
      ...(doc.tailoredContent || {}),
      name: doc.tailoredContent?.name || req.user.name || '',
      email: doc.tailoredContent?.email || req.user.email || '',
      phone: doc.tailoredContent?.phone || '',
      location: doc.tailoredContent?.location || ''
    };
    const outFormat = normalizeFormat(req.query.format);
    const buffer = outFormat === 'pdf'
      ? await generatePdf(enrichedCV, doc.coverLetter, doc.language, doc.template || 'modern')
      : await generateDocx(enrichedCV, doc.coverLetter, doc.language, doc.template || 'modern');
    const filename = filenameFor(outFormat, doc.language);

    res.setHeader('Content-Type', contentTypeFor(outFormat));
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(Buffer.from(buffer));

    posthog.captureFor(req, 'document_downloaded', { format: outFormat, template: doc.template || 'modern' });
  } catch (err) {
    if (err.statusCode) return res.status(err.statusCode).json({ error: err.message });
    next(err);
  }
};

exports.updateApplicationStatus = async (req, res, next) => {
  try {
    const { applicationStatus, companyApplied } = req.body;
    const updates = {};

    if (applicationStatus) updates.applicationStatus = applicationStatus;
    if (companyApplied !== undefined) updates.companyApplied = companyApplied;
    if (applicationStatus === 'applied' && !req.body.preserveAppliedAt) {
      updates.appliedAt = new Date();
    }

    const doc = await TailoredDocument.findOneAndUpdate(
      { _id: req.params.id, userId: req.user._id },
      { $set: updates },
      { new: true }
    );
    if (!doc) {
      return res.status(404).json({ error: 'Document not found' });
    }
    res.json(doc);

    posthog.captureFor(req, 'application_status_updated', { applicationStatus: applicationStatus || null });
  } catch (err) {
    next(err);
  }
};

exports.deleteDocument = async (req, res, next) => {
  try {
    const doc = await TailoredDocument.findOneAndDelete({ _id: req.params.id, userId: req.user._id });
    if (!doc) {
      return res.status(404).json({ error: 'Document not found' });
    }
    res.json({ message: 'Document deleted' });
  } catch (err) {
    next(err);
  }
};

exports.downloadSharedDocument = async (req, res, next) => {
  try {
    const doc = await TailoredDocument.findOne({ shareToken: req.params.token });
    if (!doc) return res.status(404).json({ error: 'Document not found or no longer shared' });

    doc.downloadCount = (doc.downloadCount || 0) + 1;
    await doc.save();

    const enrichedCV = {
      ...(doc.tailoredContent || {}),
      name: doc.tailoredContent?.name || '',
      email: doc.tailoredContent?.email || '',
      phone: '',
      location: ''
    };
    const outFormat = normalizeFormat(req.query.format);
    const buffer = outFormat === 'pdf'
      ? await generatePdf(enrichedCV, doc.coverLetter, doc.language, doc.template || 'modern')
      : await generateDocx(enrichedCV, doc.coverLetter, doc.language, doc.template || 'modern');
    const filename = filenameFor(outFormat, doc.language);

    res.setHeader('Content-Type', contentTypeFor(outFormat));
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(Buffer.from(buffer));
  } catch (err) {
    next(err);
  }
};

exports.shareDocument = async (req, res, next) => {  try {
    const doc = await TailoredDocument.findOne({ _id: req.params.id, userId: req.user._id });
    if (!doc) return res.status(404).json({ error: 'Document not found' });

    if (!doc.shareToken) {
      doc.shareToken = crypto.randomBytes(16).toString('hex');
      await doc.save();
    }

    res.json({ shareToken: doc.shareToken, shareUrl: `/shared/${doc.shareToken}` });

    posthog.captureFor(req, 'document_shared');
  } catch (err) {
    next(err);
  }
};

exports.getSharedDocument = async (req, res, next) => {
  try {
    const doc = await TailoredDocument.findOne({ shareToken: req.params.token })
      .select('jobTitle tailoredContent coverLetter language template viewCount createdAt');

    if (!doc) return res.status(404).json({ error: 'Document not found or no longer shared' });

    doc.viewCount = (doc.viewCount || 0) + 1;
    await doc.save();

    try {
      const crypto = require('crypto');
      const ipHash = crypto.createHash('sha256').update(req.ip || req.socket?.remoteAddress || 'unknown').digest('hex');
      await ShareView.create({
        token: req.params.token,
        ipHash,
        userAgent: (req.headers['user-agent'] || '').slice(0, 300),
        referer: (req.headers.referer || '').slice(0, 300)
      });
    } catch {
      // View logging must never break the shared CV page
    }

    res.json(doc);
  } catch (err) {
    next(err);
  }
};

exports.getShareStats = async (req, res, next) => {
  try {
    const doc = await TailoredDocument.findOne({ _id: req.params.id, userId: req.user._id });
    if (!doc) return res.status(404).json({ error: 'Document not found' });
    if (!doc.shareToken) {
      return res.json({ viewCount: 0, downloadCount: 0, perDay: [], referers: [], recentViews: [] });
    }

    const since = new Date();
    since.setDate(since.getDate() - 30);

    const [perDay, referers, recent] = await Promise.all([
      ShareView.aggregate([
        { $match: { token: doc.shareToken, createdAt: { $gte: since } } },
        { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, count: { $sum: 1 } } },
        { $sort: { _id: 1 } }
      ]),
      ShareView.aggregate([
        { $match: { token: doc.shareToken, referer: { $ne: '' } } },
        { $group: { _id: '$referer', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 }
      ]),
      ShareView.find({ token: doc.shareToken })
        .sort({ createdAt: -1 })
        .limit(20)
        .select('userAgent referer createdAt')
    ]);

    res.json({
      viewCount: doc.viewCount || 0,
      downloadCount: doc.downloadCount || 0,
      perDay: perDay.map((d) => ({ date: d._id, count: d.count })),
      referers: referers.map((r) => ({ referer: r._id, count: r.count })),
      recentViews: recent
    });
  } catch (err) {
    next(err);
  }
};

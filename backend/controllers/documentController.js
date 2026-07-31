const TailoredDocument = require('../models/TailoredDocument');
const User = require('../models/User');
const { generateDocx } = require('../services/documentService');
const crypto = require('crypto');

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
    const { tailoredCV, coverLetter, language, template, documentId } = req.body;

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
    const buffer = await generateDocx(enrichedCV, coverLetter || '', language || 'en', template || 'modern');

    const filename = language === 'fr' ? 'CV_Adapte.docx' : 'Tailored_CV.docx';

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
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

    res.status(201).json(doc);
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
    const buffer = await generateDocx(enrichedCV, doc.coverLetter, doc.language, doc.template || 'modern');
    const filename = doc.language === 'fr' ? 'CV_Adapte.docx' : 'Tailored_CV.docx';

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(Buffer.from(buffer));
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

exports.shareDocument = async (req, res, next) => {
  try {
    const doc = await TailoredDocument.findOne({ _id: req.params.id, userId: req.user._id });
    if (!doc) return res.status(404).json({ error: 'Document not found' });

    if (!doc.shareToken) {
      doc.shareToken = crypto.randomBytes(16).toString('hex');
      await doc.save();
    }

    res.json({ shareToken: doc.shareToken, shareUrl: `/shared/${doc.shareToken}` });
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

    res.json(doc);
  } catch (err) {
    next(err);
  }
};

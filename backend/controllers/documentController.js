const TailoredDocument = require('../models/TailoredDocument');
const User = require('../models/User');
const { generateDocx } = require('../services/documentService');
const crypto = require('crypto');

exports.generateDocument = async (req, res, next) => {
  try {
    const { tailoredCV, coverLetter, language, template } = req.body;

    if (!tailoredCV) {
      return res.status(400).json({ error: 'Tailored CV data is required' });
    }

    const buffer = await generateDocx(tailoredCV, coverLetter || '', language || 'en', template || 'modern');

    const filename = language === 'fr' ? 'CV_Adapte.docx' : 'Tailored_CV.docx';

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(Buffer.from(buffer));
  } catch (err) {
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
    const docs = await TailoredDocument.find({ userId: req.user._id })
      .sort({ createdAt: -1 })
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

    doc.downloadCount = (doc.downloadCount || 0) + 1;
    await doc.save();

    const buffer = await generateDocx(doc.tailoredContent, doc.coverLetter, doc.language, doc.template || 'modern');
    const filename = doc.language === 'fr' ? 'CV_Adapte.docx' : 'Tailored_CV.docx';

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(Buffer.from(buffer));
  } catch (err) {
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

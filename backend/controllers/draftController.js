const Draft = require('../models/Draft');

exports.getDraft = async (req, res, next) => {
  try {
    const draft = await Draft.findOne({ userId: req.user._id });
    if (!draft) return res.json({ exists: false });
    res.json({ exists: true, ...draft.toObject() });
  } catch (err) {
    next(err);
  }
};

exports.saveDraft = async (req, res, next) => {
  try {
    const { step, sourcePath, cvText, originalCV, savedCvId, savedDocId, jobDescription, language } = req.body;

    const draft = await Draft.findOneAndUpdate(
      { userId: req.user._id },
      {
        $set: {
          ...(step !== undefined ? { step } : {}),
          ...(sourcePath !== undefined ? { sourcePath } : {}),
          ...(cvText !== undefined ? { cvText } : {}),
          ...(originalCV !== undefined ? { originalCV } : {}),
          ...(savedCvId !== undefined ? { savedCvId: savedCvId || null } : {}),
          ...(savedDocId !== undefined ? { savedDocId: savedDocId || null } : {}),
          ...(jobDescription !== undefined ? { jobDescription } : {}),
          ...(language !== undefined ? { language } : {})
        }
      },
      { upsert: true, new: true }
    );

    res.json({ exists: true, ...draft.toObject() });
  } catch (err) {
    next(err);
  }
};

exports.clearDraft = async (req, res, next) => {
  try {
    await Draft.deleteOne({ userId: req.user._id });
    res.json({ message: 'Draft cleared' });
  } catch (err) {
    next(err);
  }
};

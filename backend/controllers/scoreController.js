const { computeATSScore } = require('../services/scoreService');

exports.getScore = async (req, res, next) => {
  try {
    const { cvText, jobDescription, tailoredCV, gapAnalysis } = req.body;

    if (!jobDescription) {
      return res.status(400).json({ error: 'Job description is required for scoring' });
    }

    const result = computeATSScore(cvText, jobDescription, tailoredCV, gapAnalysis);
    res.json(result);
  } catch (err) {
    next(err);
  }
};

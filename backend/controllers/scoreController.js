const { computeATSScore } = require('../services/scoreService');
const { computeResumeScore } = require('../services/resumeScoreService');

// Job-match score. Requires a job description because every one of its four
// sub-scores (keywords, skills, gaps, structure) measures the distance between
// two documents. Without a job there is nothing to measure against.
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

// Resume-quality score. Deliberately a separate endpoint rather than a relaxed
// branch of the one above, so the two response shapes stay separate contracts:
// `categories` here, `breakdown` there. A user who skips the job description on
// the tailor path previously got a 400 and therefore no score at all; this is the
// instrument that covers them.
//
// Needs no job description and makes no AI call.
exports.getResumeScore = async (req, res, next) => {
  try {
    const { cvText, tailoredCV } = req.body;

    // Neither source present is a client error, not a zero score: a zero would
    // read as "your CV is terrible" when the truth is "there was nothing to read".
    const hasText = typeof cvText === 'string' && cvText.trim().length > 0;
    const hasStructured = tailoredCV && typeof tailoredCV === 'object';
    if (!hasText && !hasStructured) {
      return res.status(400).json({ error: 'CV text is required' });
    }

    res.json(computeResumeScore(cvText, tailoredCV));
  } catch (err) {
    next(err);
  }
};

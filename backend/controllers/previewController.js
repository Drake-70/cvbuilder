const { tailorCV } = require('../services/aiService');
const { computeATSScore } = require('../services/scoreService');

function summarizeText(text, maxLength) {
  if (!text || typeof text !== 'string') return '';
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean) return '';
  const firstSentence = clean.match(/^[^.!?]+[.!?]/);
  const snippet = firstSentence ? firstSentence[0].trim() : clean;
  return snippet.length > maxLength ? `${snippet.slice(0, maxLength - 1).trim()}…` : snippet;
}

exports.atsPreview = async (req, res, next) => {
  try {
    const { cvText, jobDescription, language } = req.body;

    if (!cvText || cvText.trim().length < 20) {
      return res.status(400).json({ error: 'Paste your CV text first (at least a few lines).' });
    }
    if (!jobDescription || jobDescription.trim().length < 20) {
      return res.status(400).json({ error: 'Paste the job description you are targeting.' });
    }

    const result = await tailorCV(cvText, jobDescription, language || 'en');
    const tailoredCV = result.tailoredCV || {};
    const gaps = Array.isArray(result.gapAnalysis) ? result.gapAnalysis : [];
    const { score, breakdown, tips } = computeATSScore(cvText, jobDescription, tailoredCV, gaps);

    res.json({
      score,
      breakdown,
      tips: (tips || []).slice(0, 4),
      gaps: gaps.slice(0, 3),
      summaryTeaser: summarizeText(tailoredCV.summary, 180) || summarizeText(result.coverLetter, 180)
    });
  } catch (err) {
    if (err.message && err.message.includes('JSON')) {
      return res.status(502).json({ error: 'AI returned an invalid response. Please try again.' });
    }
    next(err);
  }
};

const { tailorCV, generateCoverLetterVariants } = require('../services/aiService');
const posthog = require('../config/posthog');

exports.tailor = async (req, res, next) => {
  try {
    const { cvText, jobDescription, language } = req.body;

    if (!cvText) {
      return res.status(400).json({ error: 'CV text is required' });
    }
    if (!jobDescription) {
      return res.status(400).json({ error: 'Job description is required' });
    }

    const result = await tailorCV(cvText, jobDescription, language || 'en');
    res.json(result);

    posthog.captureFor(req, 'cv_tailored', { language: language || 'en', hasJob: Boolean(jobDescription) });
  } catch (err) {
    if (err.message && err.message.includes('JSON')) {
      return res.status(502).json({ error: 'AI returned an invalid response. Please try again.' });
    }
    next(err);
  }
};

exports.coverLetterVariants = async (req, res, next) => {
  try {
    const { tailoredCV, jobDescription, language } = req.body;

    if (!tailoredCV || !jobDescription) {
      return res.status(400).json({ error: 'Tailored CV and job description are required' });
    }

    const variants = await generateCoverLetterVariants({
      tailoredCV,
      jobDescription,
      language: language || 'en'
    });
    res.json({ variants });

    posthog.captureFor(req, 'cover_letter_generated', { count: variants.length, language: language || 'en' });
  } catch (err) {
    if (err.message && err.message.includes('JSON')) {
      return res.status(502).json({ error: 'AI returned an invalid response. Please try again.' });
    }
    next(err);
  }
};

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
    if (posthog) {
      posthog.capture({
        event: 'cv_tailored',
        properties: { language: language || 'en' }
      });
    }
    res.json(result);
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
    if (posthog) {
      posthog.capture({
        event: 'cover_letter_generated',
        properties: { language: language || 'en', variant_count: variants.length }
      });
    }
    res.json({ variants });
  } catch (err) {
    if (err.message && err.message.includes('JSON')) {
      return res.status(502).json({ error: 'AI returned an invalid response. Please try again.' });
    }
    next(err);
  }
};

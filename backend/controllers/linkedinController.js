const { generateLinkedInProfile } = require('../services/linkedinService');
const posthog = require('../config/posthog');

exports.generate = async (req, res, next) => {
  try {
    const { tailoredCV, jobDescription, language } = req.body;

    if (!tailoredCV) {
      return res.status(400).json({ error: 'Tailored CV data is required' });
    }

    const result = await generateLinkedInProfile(tailoredCV, jobDescription, language || 'en');
    res.json(result);

    posthog.captureFor(req, 'linkedin_profile_generated', { language: language || 'en' });
  } catch (err) {
    if (err.message && err.message.includes('JSON')) {
      return res.status(502).json({ error: 'AI returned an invalid response. Please try again.' });
    }
    next(err);
  }
};

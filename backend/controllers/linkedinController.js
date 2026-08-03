const { generateLinkedInProfile } = require('../services/linkedinService');
const posthog = require('../config/posthog');

exports.generate = async (req, res, next) => {
  try {
    const { tailoredCV, jobDescription, language } = req.body;

    if (!tailoredCV) {
      return res.status(400).json({ error: 'Tailored CV data is required' });
    }

    const result = await generateLinkedInProfile(tailoredCV, jobDescription, language || 'en');
    if (posthog) {
      posthog.capture({
        event: 'linkedin_profile_generated',
        properties: { language: language || 'en', has_job_description: Boolean(jobDescription) }
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

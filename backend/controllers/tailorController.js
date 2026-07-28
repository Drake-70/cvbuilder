const { tailorCV } = require('../services/aiService');

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
  } catch (err) {
    if (err.message && err.message.includes('JSON')) {
      return res.status(502).json({ error: 'AI returned an invalid response. Please try again.' });
    }
    next(err);
  }
};

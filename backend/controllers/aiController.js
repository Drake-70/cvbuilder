const { checkGrammar } = require('../services/aiService');

exports.checkGrammar = async (req, res, next) => {
  try {
    const { text, language } = req.body;

    if (!text || !text.trim()) {
      return res.status(400).json({ error: 'Text is required' });
    }

    const result = await checkGrammar(text, language || 'en');
    res.json(result);
  } catch (err) {
    if (err.message && err.message.includes('JSON')) {
      return res.status(502).json({ error: 'AI returned an invalid response. Please try again.' });
    }
    next(err);
  }
};

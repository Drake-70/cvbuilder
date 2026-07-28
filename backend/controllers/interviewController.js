const { generateInterviewQuestions } = require('../services/aiService');
const User = require('../models/User');
const logger = require('../utils/logger');

// Interview prep: gated behind subscription only (not one-time payment)
// This is a deliberate decision — interview prep is a subscription-tier perk
exports.generate = async (req, res, next) => {
  try {
    const { jobDescription, tailoredCV, language } = req.body;

    if (!jobDescription) {
      return res.status(400).json({ error: 'Job description is required' });
    }

    // Check subscription
    const user = await User.findById(req.user._id);
    const hasActiveSubscription = user.subscriptionStatus === 'active'
      && user.subscriptionExpiresAt
      && user.subscriptionExpiresAt > new Date();

    if (!hasActiveSubscription) {
      return res.status(402).json({
        error: 'Subscription required',
        code: 'SUBSCRIPTION_REQUIRED',
        message: 'Interview prep is available for subscribers only. Upgrade to access this feature.'
      });
    }

    const result = await generateInterviewQuestions(
      jobDescription,
      tailoredCV || {},
      language || 'en'
    );

    res.json(result);
  } catch (err) {
    if (err.message && err.message.includes('JSON')) {
      return res.status(502).json({ error: 'AI returned an invalid response. Please try again.' });
    }
    next(err);
  }
};

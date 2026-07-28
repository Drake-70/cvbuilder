const TailoredDocument = require('../models/TailoredDocument');
const User = require('../models/User');
const pricing = require('../config/pricing');

// Middleware that checks if the user can download a document
// Either they have an active subscription OR the document is paid
async function requirePayment(req, res, next) {
  if (!pricing.PAYMENT_REQUIRED_FOR_DOWNLOAD) {
    return next();
  }

  const documentId = req.params.id;
  if (!documentId) {
    return next();
  }

  try {
    // Check subscription
    const user = await User.findById(req.user._id);
    if (user.subscriptionStatus === 'active' && user.subscriptionExpiresAt && user.subscriptionExpiresAt > new Date()) {
      return next();
    }

    // Check if document is paid
    const doc = await TailoredDocument.findOne({ _id: documentId, userId: req.user._id });
    if (!doc) {
      return res.status(404).json({ error: 'Document not found' });
    }

    if (doc.paid) {
      return next();
    }

    // Not paid, no subscription
    return res.status(402).json({
      error: 'Payment required',
      code: 'PAYMENT_REQUIRED',
      documentId: doc._id
    });
  } catch (err) {
    next(err);
  }
}

module.exports = requirePayment;

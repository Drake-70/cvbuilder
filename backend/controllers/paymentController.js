const crypto = require('crypto');
const Payment = require('../models/Payment');
const User = require('../models/User');
const TailoredDocument = require('../models/TailoredDocument');
const paymentService = require('../services/paymentService');
const pricing = require('../config/pricing');
const { sendPaymentReceiptEmail } = require('../services/emailService');
const logger = require('../utils/logger');

exports.initiate = async (req, res, next) => {
  try {
    const { phoneNumber, amount, type, documentId } = req.body;

    if (!phoneNumber) {
      return res.status(400).json({ error: 'Phone number is required' });
    }

    // Determine amount
    let payAmount = amount;
    let payType = type || 'one-time';

    const VALID_TYPES = ['one-time', 'subscription'];
    if (!VALID_TYPES.includes(payType)) {
      return res.status(400).json({ error: 'Invalid payment type' });
    }

    if (payAmount !== undefined && (isNaN(payAmount) || payAmount < 0)) {
      return res.status(400).json({ error: 'Invalid amount' });
    }

    if (!payAmount) {
      if (payType === 'subscription') {
        payAmount = paymentService.isSandbox() ? pricing.SANDBOX_SUBSCRIPTION_AMOUNT : pricing.SUBSCRIPTION_AMOUNT;
      } else {
        payAmount = paymentService.isSandbox() ? pricing.SANDBOX_ONE_TIME_AMOUNT : pricing.ONE_TIME_AMOUNT;
      }
    }

    // Detect provider from phone prefix
    const cleanPhone = phoneNumber.replace(/[\s+]/g, '');
    let provider = 'mtn';
    const digits = cleanPhone.replace(/^237/, '');
    if (digits.startsWith('65') || digits.startsWith('66') || digits.startsWith('67') || digits.startsWith('68') || digits.startsWith('69')) {
      provider = 'orange';
    }

    const reference = `cvboost-${req.user._id.toString().slice(-6)}-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;

    // Create payment record
    const payment = await Payment.create({
      userId: req.user._id,
      type: payType,
      amount: payAmount,
      currency: pricing.CURRENCY,
      phoneNumber: cleanPhone,
      provider,
      documentId: documentId || null,
      campayReference: reference,
      status: 'pending'
    });

    // Initiate CamPay collection
    const description = payType === 'subscription'
      ? 'CVBoost Monthly Subscription'
      : 'CVBoost CV Download';

    let result;
    try {
      result = await paymentService.initiatePayment({
        phoneNumber: cleanPhone,
        amount: payAmount,
        description,
        reference
      });
    } catch (err) {
      payment.status = 'failed';
      await payment.save();
      logger.error(`CamPay initiation failed for payment ${payment._id}: ${err.message}`);
      return res.status(502).json({ error: 'Payment initiation failed. Please try again.' });
    }

    payment.campayReference = result.reference || reference;
    await payment.save();

    const USSD_SHORTCODES = { mtn: '*126#', orange: '#150#' };

    res.json({
      paymentId: payment._id,
      reference: payment.campayReference,
      status: 'pending',
      amount: payAmount,
      currency: pricing.CURRENCY,
      provider,
      ussdCode: result.ussdCode || null,
      ussdShortcode: USSD_SHORTCODES[provider] || '*126#',
      message: 'Check your phone to approve the payment'
    });
  } catch (err) {
    next(err);
  }
};

exports.status = async (req, res, next) => {
  try {
    const payment = await Payment.findOne({ _id: req.params.referenceId, userId: req.user._id });

    if (!payment) {
      return res.status(404).json({ error: 'Payment not found' });
    }

    if (payment.status === 'success') {
      return res.json({ status: 'success', paymentId: payment._id });
    }

    if (payment.status === 'failed' || payment.status === 'expired') {
      return res.json({ status: payment.status, paymentId: payment._id });
    }

    // Check with CamPay
    try {
      const camPayStatus = await paymentService.checkStatus(payment.campayReference);

      if (camPayStatus.status === 'SUCCESS') {
        payment.status = 'success';
        await payment.save();

        // Activate purchase
        await activatePayment(payment);

        return res.json({ status: 'success', paymentId: payment._id });
      } else if (camPayStatus.status === 'FAILED') {
        payment.status = 'failed';
        await payment.save();
        return res.json({ status: 'failed', paymentId: payment._id });
      }
    } catch (pollErr) {
      logger.error(`CamPay status check failed for ${payment._id}: ${pollErr.message}`);
    }

    res.json({ status: payment.status, paymentId: payment._id });
  } catch (err) {
    next(err);
  }
};

exports.webhook = async (req, res, next) => {
  try {
    const payload = req.body;
    const signature = req.headers['x-campay-signature'] || '';

    if (!paymentService.verifyWebhookSignature(payload, signature)) {
      logger.warn('Invalid CamPay webhook signature');
      return res.status(401).json({ error: 'Invalid signature' });
    }

    const { reference, status } = payload;

    if (!reference) {
      return res.status(400).json({ error: 'Missing reference' });
    }

    const payment = await Payment.findOne({ campayReference: reference });
    if (!payment) {
      return res.status(404).json({ error: 'Payment not found' });
    }

    if (status === 'SUCCESS' && payment.status !== 'success') {
      payment.status = 'success';
      await payment.save();
      await activatePayment(payment);
    } else if (status === 'FAILED') {
      payment.status = 'failed';
      await payment.save();
    }

    res.json({ received: true });
  } catch (err) {
    next(err);
  }
};

async function activatePayment(payment) {
  let documentAttachment = null;

  if (payment.type === 'subscription') {
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + pricing.SUBSCRIPTION_DURATION_DAYS);

    await User.findByIdAndUpdate(payment.userId, {
      subscriptionStatus: 'active',
      subscriptionExpiresAt: expiresAt
    });

    logger.info('Subscription activated', { userId: payment.userId, expiresAt });
  } else if (payment.type === 'one-time' && payment.documentId) {
    await TailoredDocument.findByIdAndUpdate(payment.documentId, { paid: true });
    logger.info('Document marked as paid', { documentId: payment.documentId });

    documentAttachment = await buildDocumentAttachment(payment.documentId);
  }

  const user = await User.findById(payment.userId).select('email preferredLanguage');
  if (user) {
    sendPaymentReceiptEmail({
      email: user.email,
      amount: payment.amount,
      currency: payment.currency,
      type: payment.type,
      reference: payment.campayReference || payment._id,
      provider: payment.provider,
      date: payment.createdAt || new Date(),
      language: user.preferredLanguage || 'en',
      attachments: documentAttachment ? [documentAttachment] : undefined
    }).catch(err => {
      logger.error(`Payment receipt email failed for payment ${payment._id}: ${err.message}`);
    });
  }
}

async function buildDocumentAttachment(documentId) {
  try {
    const { generateDocx } = require('../services/documentService');
    const doc = await TailoredDocument.findById(documentId);
    if (!doc) return null;

    const cv = {
      ...(doc.tailoredContent || {}),
      name: doc.tailoredContent?.name || '',
      email: doc.tailoredContent?.email || '',
      phone: doc.tailoredContent?.phone || '',
      location: doc.tailoredContent?.location || ''
    };
    const buffer = await generateDocx(cv, doc.coverLetter, doc.language, doc.template || 'modern');
    const filename = doc.language === 'fr' ? 'CV_Adapte.docx' : 'Tailored_CV.docx';

    return { filename, content: Buffer.from(buffer) };
  } catch (err) {
    logger.error(`Failed to build document attachment for ${documentId}: ${err.message}`);
    return null;
  }
}

exports.getPricing = async (_req, res) => {
  const isSandbox = paymentService.isSandbox();
  res.json({
    oneTime: {
      amount: isSandbox ? pricing.SANDBOX_ONE_TIME_AMOUNT : pricing.ONE_TIME_AMOUNT,
      currency: pricing.CURRENCY,
      description: 'One tailored CV + cover letter download'
    },
    subscription: {
      amount: isSandbox ? pricing.SANDBOX_SUBSCRIPTION_AMOUNT : pricing.SUBSCRIPTION_AMOUNT,
      currency: pricing.CURRENCY,
      duration: `${pricing.SUBSCRIPTION_DURATION_DAYS} days`,
      description: 'Unlimited CV tailoring and downloads'
    },
    sandbox: isSandbox
  });
};

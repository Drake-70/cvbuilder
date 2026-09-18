const crypto = require('crypto');
const Payment = require('../models/Payment');
const User = require('../models/User');
const TailoredDocument = require('../models/TailoredDocument');
const paymentService = require('../services/paymentService');
const pricing = require('../config/pricing');
const { sendPaymentReceiptEmail } = require('../services/emailService');
const logger = require('../utils/logger');
const posthog = require('../config/posthog');
const cmoRevenue = require('../services/cmoRevenue');

exports.initiate = async (req, res, next) => {
  try {
    const { phoneNumber, amount, type, documentId, paymentMethod = 'campay', email } = req.body;

    if (paymentMethod !== 'campay' && !['campay', 'paystack', 'stripe'].includes(paymentMethod)) {
      return res.status(400).json({ error: 'Invalid payment method' });
    }

    if (paymentMethod === 'campay' && !phoneNumber) {
      return res.status(400).json({ error: 'Phone number is required' });
    }

    if (paymentMethod !== 'campay' && !email) {
      return res.status(400).json({ error: 'Email is required for card payments' });
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

    // Detect provider from phone prefix (mobile money only)
    let provider = 'mtn';
    if (paymentMethod === 'campay') {
      const cleanPhone = phoneNumber.replace(/[\s+]/g, '');
      const digits = cleanPhone.replace(/^237/, '');
      if (digits.startsWith('65') || digits.startsWith('66') || digits.startsWith('67') || digits.startsWith('68') || digits.startsWith('69')) {
        provider = 'orange';
      }
    }

    const reference = `cvboost-${req.user._id.toString().slice(-6)}-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
    const description = payType === 'subscription'
      ? 'CVBoost Monthly Subscription'
      : 'CVBoost CV Download';

    // Create payment record
    const payment = await Payment.create({
      userId: req.user._id,
      type: payType,
      amount: payAmount,
      currency: pricing.CURRENCY,
      phoneNumber: paymentMethod === 'campay' ? phoneNumber.replace(/[\s+]/g, '') : '',
      provider,
      paymentMethod,
      email: email || null,
      documentId: documentId || null,
      campayReference: reference,
      status: 'pending'
    });

    const origin = `${req.protocol}://${req.get('host')}`;
    const successUrl = documentId
      ? `${origin}/documents/${documentId}?payment=${payment._id}`
      : `${origin}/tailor?payment=${payment._id}`;
    let result;
    try {
      result = await paymentService.initiateProvider({
        provider: paymentMethod,
        phoneNumber: payment.phoneNumber,
        email,
        amount: payAmount,
        currency: pricing.CURRENCY,
        description,
        reference,
        successUrl,
        cancelUrl: origin
      });
    } catch (err) {
      payment.status = 'failed';
      await payment.save();
      logger.error(`Payment initiation failed for ${payment._id}: ${err.message}`);
      return res.status(err.statusCode || 502).json({ error: 'Payment initiation failed. Please try again.' });
    }

    if (paymentMethod === 'campay') {
      payment.campayReference = result.reference || reference;
      await payment.save();
    } else {
      payment.providerRef = result.sessionId || result.accessCode || result.reference || null;
      payment.campayReference = reference;
      await payment.save();
    }

    const USSD_SHORTCODES = { mtn: '*126#', orange: '#150#' };

    const baseResponse = {
      paymentId: payment._id,
      reference: payment.campayReference,
      status: 'pending',
      amount: payAmount,
      currency: pricing.CURRENCY,
      provider,
      paymentMethod
    };

    if (paymentMethod !== 'campay') {
      return res.json({
        ...baseResponse,
        redirect: true,
        url: result.url
      });
    }

    res.json({
      ...baseResponse,
      ussdCode: result.ussdCode || null,
      ussdShortcode: USSD_SHORTCODES[provider] || '*126#',
      message: 'Check your phone to approve the payment'
    });

    posthog.captureFor(req, 'payment_initiated', {
      type: payType,
      amount: payAmount,
      provider: paymentMethod === 'campay' ? provider : paymentMethod,
      currency: pricing.CURRENCY
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

    // Check with the payment provider
    try {
      const providerStatus = await paymentService.checkProviderStatus({
        provider: payment.paymentMethod || 'campay',
        campayReference: payment.campayReference,
        providerRef: payment.providerRef
      });

      if (providerStatus.status === 'SUCCESS') {
        payment.status = 'success';
        await payment.save();

        // Activate purchase
        await activatePayment(payment);

        posthog.captureFor(req, 'payment_completed', {
          type: payment.type,
          amount: payment.amount,
          provider: payment.paymentMethod || payment.provider
        });

        return res.json({ status: 'success', paymentId: payment._id });
      } else if (providerStatus.status === 'FAILED') {
        payment.status = 'failed';
        await payment.save();
        return res.json({ status: 'failed', paymentId: payment._id });
      }
    } catch (pollErr) {
      logger.error(`Payment status check failed for ${payment._id}: ${pollErr.message}`);
    }

    res.json({ status: payment.status, paymentId: payment._id });
  } catch (err) {
    next(err);
  }
};

exports.webhook = async (req, res, next) => {
  try {
    const rawBody = req.rawBody || Buffer.from(JSON.stringify(req.body));
    const body = req.body;
    const campaySig = req.headers['x-campay-signature'] || '';
    const paystackSig = req.headers['x-paystack-signature'] || '';
    const stripeSig = req.headers['stripe-signature'] || '';

    // CamPay
    if (campaySig) {
      if (!paymentService.verifyWebhookSignature(body, campaySig)) {
        logger.warn('Invalid CamPay webhook signature');
        return res.status(401).json({ error: 'Invalid signature' });
      }

      const { reference, status } = body;
      if (!reference) return res.status(400).json({ error: 'Missing reference' });

      const payment = await Payment.findOne({ campayReference: reference });
      if (!payment) return res.status(404).json({ error: 'Payment not found' });

      if (status === 'SUCCESS' && payment.status !== 'success') {
        payment.status = 'success';
        await payment.save();
        await activatePayment(payment);

        posthog.capture('payment_completed', payment.userId ? payment.userId.toString() : 'anonymous', {
          type: payment.type,
          amount: payment.amount,
          provider: payment.provider,
          source: 'webhook'
        });
      } else if (status === 'FAILED') {
        payment.status = 'failed';
        await payment.save();
      }

      return res.json({ received: true });
    }

    // Paystack
    if (paystackSig && process.env.PAYSTACK_SECRET_KEY) {
      const crypto = require('crypto');
      const expected = crypto
        .createHmac('sha512', process.env.PAYSTACK_SECRET_KEY)
        .update(rawBody)
        .digest('hex');
      if (expected !== paystackSig) {
        logger.warn('Invalid Paystack webhook signature');
        return res.status(401).json({ error: 'Invalid signature' });
      }

      if (body.event !== 'charge.success') return res.json({ received: true });

      const reference = body.data && body.data.reference;
      const payment = await Payment.findOne({ campayReference: reference });
      if (!payment) return res.status(404).json({ error: 'Payment not found' });

      if (payment.status !== 'success') {
        payment.status = 'success';
        await payment.save();
        await activatePayment(payment);

        posthog.capture('payment_completed', payment.userId ? payment.userId.toString() : 'anonymous', {
          type: payment.type,
          amount: payment.amount,
          provider: 'paystack',
          source: 'webhook'
        });
      }

      return res.json({ received: true });
    }

    // Stripe
    if (stripeSig && process.env.STRIPE_WEBHOOK_SECRET) {
      const crypto = require('crypto');
      const parts = stripeSig.split(',').reduce((acc, part) => {
        const [k, v] = part.split('=');
        acc[k.trim()] = v;
        return acc;
      }, {});
      const signed = `${parts.t}.${rawBody.toString('utf8')}`;
      const expected = crypto
        .createHmac('sha256', process.env.STRIPE_WEBHOOK_SECRET)
        .update(signed)
        .digest('hex');
      if (!parts.t || !parts.v1 || expected !== parts.v1) {
        logger.warn('Invalid Stripe webhook signature');
        return res.status(401).json({ error: 'Invalid signature' });
      }

      if (body.type !== 'checkout.session.completed') return res.json({ received: true });

      const reference = body.data && body.data.object && (body.data.object.client_reference_id || '');
      const payment = await Payment.findOne({ campayReference: reference });
      if (!payment) return res.status(404).json({ error: 'Payment not found' });

      if (payment.status !== 'success') {
        payment.status = 'success';
        await payment.save();
        await activatePayment(payment);

        posthog.capture('payment_completed', payment.userId ? payment.userId.toString() : 'anonymous', {
          type: payment.type,
          amount: payment.amount,
          provider: 'stripe',
          source: 'webhook'
        });
      }

      return res.json({ received: true });
    }

    res.status(400).json({ error: 'Unrecognized webhook payload' });
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

  // Feed the CMO.ai studio revenue ledger (fire-and-forget).
  cmoRevenue.report({
    product: 'cvboost',
    provider: payment.paymentMethod || 'other',
    kind: payment.type === 'subscription' ? 'subscription' : 'payment',
    amount: payment.amount,
    currency: payment.currency || 'XAF',
    status: 'succeeded',
    reference: payment.campayReference || String(payment._id),
    customer: payment.email || (user && user.email) || String(payment.userId),
    detail: payment.type
  }).catch(() => {});
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
    providers: paymentService.getEnabledProviders(),
    sandbox: isSandbox
  });
};

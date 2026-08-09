const logger = require('../utils/logger');

// CamPay API wrapper
// Docs: https://developers.campay.net
// Sandbox mode: use test credentials, amounts < 100 XAF
// Live mode: use production credentials

const CAMPAY_BASE_URL = process.env.CAMPAY_API_URL || 'https://api.campay.net/api';
const FETCH_TIMEOUT_MS = 15000;

function isSandbox() {
  return process.env.NODE_ENV !== 'production';
}

let cachedToken = null;
let tokenExpiresAt = 0;

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function getAccessToken() {
  if (cachedToken && Date.now() < tokenExpiresAt) {
    return cachedToken;
  }

  const res = await fetchWithTimeout(`${CAMPAY_BASE_URL}/token/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: isSandbox() ? process.env.CAMPAY_SANDBOX_USERNAME : process.env.CAMPAY_USERNAME,
      password: isSandbox() ? process.env.CAMPAY_SANDBOX_PASSWORD : process.env.CAMPAY_PASSWORD
    })
  });

  if (!res.ok) {
    const err = await res.text();
    logger.error('CamPay token error:', err);
    throw new Error('Failed to authenticate with CamPay');
  }

  const data = await res.json();
  cachedToken = data.access;
  const ttlSeconds = Number(data.access_expires) > 0 ? Number(data.access_expires) : 3600;
  tokenExpiresAt = Date.now() + Math.min(Math.max(ttlSeconds, 60), 86400) * 1000;

  return cachedToken;
}

exports.initiatePayment = async ({ phoneNumber, amount, description, reference }) => {
  const token = await getAccessToken();

  const res = await fetchWithTimeout(`${CAMPAY_BASE_URL}/collect/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      amount: String(amount),
      phone_number: phoneNumber.replace(/[\s+]/g, ''),
      description: description || 'CVBoost payment',
      reference: reference || `cvboost-${Date.now()}`
    })
  });

  if (!res.ok) {
    const err = await res.text();
    logger.error('CamPay collect error:', err);
    throw new Error('Failed to initiate payment');
  }

  const data = await res.json();
  logger.info('CamPay payment initiated:', { reference: data.reference, status: data.status });

  return {
    reference: data.reference,
    status: data.status,
    ussdCode: data.ussd_code || null,
    message: data.message || null
  };
};

exports.checkStatus = async (reference) => {
  const token = await getAccessToken();

  const res = await fetchWithTimeout(`${CAMPAY_BASE_URL}/collect/${reference}/`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });

  if (!res.ok) {
    const err = await res.text();
    logger.error('CamPay status check error:', err);
    throw new Error('Failed to check payment status');
  }

  const data = await res.json();
  return {
    reference: data.reference,
    status: data.status, // SUCCESS, FAILED, PENDING
    amount: data.amount,
    phone_number: data.phone_number,
    reference_id: data.reference_id
  };
};

exports.verifyWebhookSignature = (payload, signature) => {
  const secret = process.env.CAMPAY_WEBHOOK_SECRET;

  if (!secret) {
    // In production a webhook secret MUST be configured; otherwise the
    // endpoint would accept unauthenticated "success" payloads.
    if (!isSandbox()) return false;
    logger.warn('CAMPAY_WEBHOOK_SECRET not set; accepting webhook payloads in development only');
    return true;
  }

  const crypto = require('crypto');
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(JSON.stringify(payload))
    .digest('hex');

  return signature === expectedSignature;
};

// ---------------------------------------------------------------------------
// Paystack (cards / bank)
// Docs: https://paystack.com/docs/api/transaction
// Gated on PAYSTACK_SECRET_KEY being set. XAF is a zero-decimal currency, so
// amounts are passed as-is (no kobo/cent conversion).
// ---------------------------------------------------------------------------

const PAYSTACK_BASE_URL = 'https://api.paystack.co';

function paystackEnabled() {
  return Boolean(process.env.PAYSTACK_SECRET_KEY);
}

async function paystackInitialize({ email, amount, currency, reference }) {
  const res = await fetchWithTimeout(`${PAYSTACK_BASE_URL}/transaction/initialize`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.PAYSTACK_SECRET_KEY}`
    },
    body: JSON.stringify({
      email,
      amount: String(amount),
      currency: currency || 'XAF',
      reference
    })
  });

  if (!res.ok) {
    const err = await res.text();
    logger.error('Paystack initialize error:', err);
    throw new Error('Failed to initialize card payment');
  }

  const data = await res.json();
  if (!data.status) {
    logger.error('Paystack initialize rejected:', data.message);
    throw new Error('Failed to initialize card payment');
  }

  return {
    url: data.data.authorization_url,
    accessCode: data.data.access_code,
    reference: data.data.reference
  };
}

async function paystackVerify(reference) {
  const res = await fetchWithTimeout(
    `${PAYSTACK_BASE_URL}/transaction/verify/${encodeURIComponent(reference)}`,
    {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${process.env.PAYSTACK_SECRET_KEY}` }
    }
  );

  if (!res.ok) {
    const err = await res.text();
    logger.error('Paystack verify error:', err);
    throw new Error('Failed to verify card payment');
  }

  const data = await res.json();
  if (!data.status) return { status: 'FAILED', reference };
  return { status: data.data.status === 'success' ? 'SUCCESS' : 'FAILED', reference };
}

// ---------------------------------------------------------------------------
// Stripe (cards) via the REST API (no SDK dependency)
// Docs: https://stripe.com/docs/api/checkout/sessions
// Gated on STRIPE_SECRET_KEY being set. XAF is a zero-decimal currency, so
// unit_amount is the amount in XAF directly.
// ---------------------------------------------------------------------------

const STRIPE_BASE_URL = 'https://api.stripe.com';

function stripeEnabled() {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

function stripeAuthHeaders() {
  return { 'Authorization': `Bearer ${process.env.STRIPE_SECRET_KEY}` };
}

async function stripeCreateCheckoutSession({ amount, currency, reference, successUrl, cancelUrl, email }) {
  const body = new URLSearchParams({
    mode: 'payment',
    'line_items[0][quantity]': '1',
    'line_items[0][price_data][currency]': (currency || 'XAF').toLowerCase(),
    'line_items[0][price_data][unit_amount]': String(amount),
    'line_items[0][price_data][product_data][name]': 'CVBoost tailored CV download',
    'success_url': successUrl,
    'cancel_url': cancelUrl,
    'client_reference_id': reference
  });
  if (email) body.set('customer_email', email);

  const res = await fetchWithTimeout(`${STRIPE_BASE_URL}/v1/checkout/sessions`, {
    method: 'POST',
    headers: { ...stripeAuthHeaders(), 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  });

  if (!res.ok) {
    const err = await res.text();
    logger.error('Stripe session error:', err);
    throw new Error('Failed to initialize card payment');
  }

  const data = await res.json();
  return { url: data.url, sessionId: data.id };
}

async function stripeGetSession(sessionId) {
  const res = await fetchWithTimeout(`${STRIPE_BASE_URL}/v1/checkout/sessions/${encodeURIComponent(sessionId)}`, {
    method: 'GET',
    headers: stripeAuthHeaders()
  });

  if (!res.ok) {
    const err = await res.text();
    logger.error('Stripe session retrieve error:', err);
    throw new Error('Failed to verify card payment');
  }

  const data = await res.json();
  return { status: data.payment_status === 'paid' ? 'SUCCESS' : 'FAILED', sessionId };
}

exports.getEnabledProviders = () => {
  const providers = [{ id: 'campay', name: 'Mobile Money (MTN / Orange)' }];
  if (paystackEnabled()) providers.push({ id: 'paystack', name: 'Paystack (Card / Bank)' });
  if (stripeEnabled()) providers.push({ id: 'stripe', name: 'Stripe (Card)' });
  return providers;
};

exports.initiateProvider = async ({ provider, email, phoneNumber, amount, currency, description, reference, successUrl, cancelUrl }) => {
  switch (provider) {
    case 'paystack':
      if (!paystackEnabled()) throw Object.assign(new Error('Paystack is not configured'), { statusCode: 400 });
      return {
        provider,
        ...(await paystackInitialize({ email, amount, currency, reference })),
        redirect: true
      };
    case 'stripe':
      if (!stripeEnabled()) throw Object.assign(new Error('Stripe is not configured'), { statusCode: 400 });
      return {
        provider,
        ...(await stripeCreateCheckoutSession({ amount, currency, reference, successUrl, cancelUrl, email })),
        redirect: true
      };
    case 'campay':
    default:
      return {
        provider: 'campay',
        ...(await exports.initiatePayment({ phoneNumber, amount, description, reference })),
        redirect: false
      };
  }
};

exports.checkProviderStatus = async ({ provider, campayReference, providerRef }) => {
  switch (provider) {
    case 'paystack':
      if (!paystackEnabled()) throw new Error('Paystack is not configured');
      return paystackVerify(providerRef);
    case 'stripe':
      if (!stripeEnabled()) throw new Error('Stripe is not configured');
      return stripeGetSession(providerRef);
    case 'campay':
    default:
      return exports.checkStatus(campayReference);
  }
};

exports.isSandbox = () => isSandbox();

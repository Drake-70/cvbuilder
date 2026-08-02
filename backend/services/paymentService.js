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

exports.isSandbox = () => isSandbox();

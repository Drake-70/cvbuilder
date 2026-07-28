const logger = require('../utils/logger');

// CamPay API wrapper
// Docs: https://developers.campay.net
// Sandbox mode: use test credentials, amounts < 100 XAF
// Live mode: use production credentials

const CAMPAY_BASE_URL = process.env.CAMPAY_API_URL || 'https://api.campay.net/api';
const isSandbox = process.env.NODE_ENV !== 'production';

async function getAccessToken() {
  const res = await fetch(`${CAMPAY_BASE_URL}/token/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: isSandbox ? process.env.CAMPAY_SANDBOX_USERNAME : process.env.CAMPAY_USERNAME,
      password: isSandbox ? process.env.CAMPAY_SANDBOX_PASSWORD : process.env.CAMPAY_PASSWORD
    })
  });

  if (!res.ok) {
    const err = await res.text();
    logger.error('CamPay token error:', err);
    throw new Error('Failed to authenticate with CamPay');
  }

  const data = await res.json();
  return data.access;
}

exports.initiatePayment = async ({ phoneNumber, amount, description, reference }) => {
  const token = await getAccessToken();

  const res = await fetch(`${CAMPAY_BASE_URL}/collect/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      amount: String(amount),
      phone_number: phoneNumber.replace(/\s/g, ''),
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

  const res = await fetch(`${CAMPAY_BASE_URL}/collect/${reference}/`, {
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
  // CamPay sends a signature with webhook payloads
  // In sandbox mode, skip verification for easier testing
  if (isSandbox) return true;

  const crypto = require('crypto');
  const secret = process.env.CAMPAY_WEBHOOK_SECRET;
  if (!secret) return true;

  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(JSON.stringify(payload))
    .digest('hex');

  return signature === expectedSignature;
};

exports.isSandbox = () => isSandbox;

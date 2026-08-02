const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const path = require('path');

const SERVICE_PATH = path.resolve(__dirname, '../services/paymentService.js');

let paymentService;
let fetchCalls;
let envBackup;

function mockFetch(handler) {
  global.fetch = async (url, options = {}) => {
    fetchCalls.push({ url, options });
    const res = handler({ url, options });
    if (res && typeof res.then === 'function') return res;
    return {
      ok: res.ok ?? true,
      status: res.status ?? 200,
      async json() { return res.json; },
      async text() { return res.text ?? ''; }
    };
  };
}

beforeEach(() => {
  envBackup = { ...process.env };
  fetchCalls = [];
  delete require.cache[SERVICE_PATH];
  paymentService = require(SERVICE_PATH);
});

afterEach(() => {
  process.env = envBackup;
  delete global.fetch;
  delete require.cache[SERVICE_PATH];
});

test('initiatePayment sends stripped phone number and string amount, maps result', async () => {
  mockFetch(({ url, options }) => {
    if (url.endsWith('/token/')) {
      return { json: { access: 'tok-1', access_expires: 3600 } };
    }
    if (url.endsWith('/collect/')) {
      assert.equal(JSON.parse(options.body).phone_number, '237655123456');
      assert.equal(JSON.parse(options.body).amount, '500');
      return { json: { reference: 'ref-123', status: 'PENDING', ussd_code: '*123#', message: 'Dial to pay' } };
    }
    throw new Error(`unexpected url ${url}`);
  });

  const result = await paymentService.initiatePayment({
    phoneNumber: '+237 655 12 34 56',
    amount: 500,
    description: 'CVBoost CV Download',
    reference: 'ref-123'
  });

  assert.deepEqual(result, {
    reference: 'ref-123',
    status: 'PENDING',
    ussdCode: '*123#',
    message: 'Dial to pay'
  });
});

test('initiatePayment throws when CamPay collect fails', async () => {
  mockFetch(({ url }) => {
    if (url.endsWith('/token/')) return { json: { access: 'tok-1', access_expires: 3600 } };
    return { ok: false, status: 400, json: {}, text: 'Bad request' };
  });

  await assert.rejects(
    paymentService.initiatePayment({ phoneNumber: '237655123456', amount: 500, reference: 'r1' }),
    /Failed to initiate payment/
  );
});

test('initiatePayment throws when token auth fails', async () => {
  mockFetch(() => ({ ok: false, status: 401, json: {}, text: 'Unauthorized' }));

  await assert.rejects(
    paymentService.initiatePayment({ phoneNumber: '237655123456', amount: 500, reference: 'r1' }),
    /Failed to authenticate with CamPay/
  );
});

test('access token is cached and reused for a second request', async () => {
  let tokenRequests = 0;
  mockFetch(({ url }) => {
    if (url.endsWith('/token/')) {
      tokenRequests++;
      return { json: { access: 'tok-1', access_expires: 3600 } };
    }
    return { json: { reference: 'ref-x', status: 'SUCCESS' } };
  });

  await paymentService.initiatePayment({ phoneNumber: '237655123456', amount: 100, reference: 'a' });
  await paymentService.checkStatus('ref-x');

  assert.equal(tokenRequests, 1);
});

test('checkStatus maps CamPay status fields', async () => {
  mockFetch(({ url }) => {
    if (url.endsWith('/token/')) return { json: { access: 'tok-1', access_expires: 3600 } };
    if (url.includes('/collect/ref-9/')) {
      return { json: { reference: 'ref-9', status: 'SUCCESS', amount: '500', phone_number: '237655123456', reference_id: 'rid' } };
    }
    throw new Error(`unexpected url ${url}`);
  });

  const result = await paymentService.checkStatus('ref-9');
  assert.equal(result.status, 'SUCCESS');
  assert.equal(result.reference_id, 'rid');
});

test('fetch calls pass an abort signal (timeout wiring)', async () => {
  mockFetch(() => ({ json: { access: 'tok-1', access_expires: 3600 } }));
  await paymentService.initiatePayment({ phoneNumber: '237655123456', amount: 100, reference: 'a' });
  assert.ok(fetchCalls.length > 0);
  for (const call of fetchCalls) {
    assert.ok(call.options.signal, 'expected an AbortSignal to be passed');
  }
});

test('verifyWebhookSignature: dev accepts when no secret configured', () => {
  process.env.NODE_ENV = 'development';
  delete process.env.CAMPAY_WEBHOOK_SECRET;
  assert.equal(paymentService.verifyWebhookSignature({ status: 'SUCCESS' }, 'anything'), true);
});

test('verifyWebhookSignature: production rejects when no secret configured', () => {
  process.env.NODE_ENV = 'production';
  delete process.env.CAMPAY_WEBHOOK_SECRET;
  assert.equal(paymentService.verifyWebhookSignature({ status: 'SUCCESS' }, 'anything'), false);
});

test('verifyWebhookSignature: valid HMAC signature passes', () => {
  process.env.NODE_ENV = 'production';
  process.env.CAMPAY_WEBHOOK_SECRET = 'super-secret';
  const payload = { reference: 'ref-1', status: 'SUCCESS' };
  const sig = crypto.createHmac('sha256', 'super-secret').update(JSON.stringify(payload)).digest('hex');
  assert.equal(paymentService.verifyWebhookSignature(payload, sig), true);
});

test('verifyWebhookSignature: invalid signature is rejected in production', () => {
  process.env.NODE_ENV = 'production';
  process.env.CAMPAY_WEBHOOK_SECRET = 'super-secret';
  assert.equal(paymentService.verifyWebhookSignature({ reference: 'ref-1', status: 'SUCCESS' }, 'forged'), false);
});

test('isSandbox reflects NODE_ENV', () => {
  process.env.NODE_ENV = 'production';
  assert.equal(paymentService.isSandbox(), false);
  process.env.NODE_ENV = 'development';
  assert.equal(paymentService.isSandbox(), true);
});

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

test('getEnabledProviders always includes campay and only adds enabled card providers', () => {
  const base = paymentService.getEnabledProviders().map((p) => p.id);
  assert.deepEqual(base, ['campay']);

  process.env.PAYSTACK_SECRET_KEY = 'pk_test_1';
  process.env.STRIPE_SECRET_KEY = 'sk_test_1';
  const all = paymentService.getEnabledProviders().map((p) => p.id);
  assert.deepEqual(all, ['campay', 'paystack', 'stripe']);
});

test('initiateProvider: paystack initialize returns redirect with authorization url', async () => {
  process.env.PAYSTACK_SECRET_KEY = 'pk_test_1';
  mockFetch(({ url, options }) => {
    if (url.includes('/transaction/initialize')) {
      assert.equal(JSON.parse(options.body).email, 'card@example.com');
      assert.equal(JSON.parse(options.body).amount, '500');
      assert.equal(JSON.parse(options.body).currency, 'XAF');
      return {
        json: { status: true, message: 'OK', data: { authorization_url: 'https://paystack.com/pay/x', access_code: 'ac', reference: 'ref-ps' } }
      };
    }
    throw new Error(`unexpected url ${url}`);
  });

  const result = await paymentService.initiateProvider({
    provider: 'paystack',
    email: 'card@example.com',
    amount: 500,
    currency: 'XAF',
    reference: 'ref-ps'
  });

  assert.deepEqual(result, {
    provider: 'paystack',
    url: 'https://paystack.com/pay/x',
    accessCode: 'ac',
    reference: 'ref-ps',
    redirect: true
  });
});

test('initiateProvider: paystack throws when not configured', async () => {
  delete process.env.PAYSTACK_SECRET_KEY;
  await assert.rejects(
    paymentService.initiateProvider({ provider: 'paystack', email: 'a@b.com', amount: 500, reference: 'r' }),
    /Paystack is not configured/
  );
});

test('initiateProvider: stripe creates checkout session with success/cancel urls', async () => {
  process.env.STRIPE_SECRET_KEY = 'sk_test_1';
  mockFetch(({ url, options }) => {
    if (url.includes('/v1/checkout/sessions')) {
      assert.ok(options.headers.Authorization.includes('sk_test_1'));
      const body = options.body;
      assert.equal(body.get('success_url'), 'https://cvboost.example/documents/abc?payment=pay-1');
      assert.equal(body.get('cancel_url'), 'https://cvboost.example');
      assert.equal(body.get('client_reference_id'), 'ref-st');
      assert.equal(body.get('customer_email'), 'stripe@example.com');
      return { json: { url: 'https://checkout.stripe.com/c/pay/x', id: 'cs_test_1' } };
    }
    throw new Error(`unexpected url ${url}`);
  });

  const result = await paymentService.initiateProvider({
    provider: 'stripe',
    email: 'stripe@example.com',
    amount: 500,
    currency: 'XAF',
    reference: 'ref-st',
    successUrl: 'https://cvboost.example/documents/abc?payment=pay-1',
    cancelUrl: 'https://cvboost.example'
  });

  assert.deepEqual(result, { provider: 'stripe', url: 'https://checkout.stripe.com/c/pay/x', sessionId: 'cs_test_1', redirect: true });
});

test('initiateProvider: stripe throws when not configured', async () => {
  delete process.env.STRIPE_SECRET_KEY;
  await assert.rejects(
    paymentService.initiateProvider({ provider: 'stripe', email: 'a@b.com', amount: 500, reference: 'r' }),
    /Stripe is not configured/
  );
});

test('initiateProvider: campay branch keeps existing ussd behaviour (no redirect)', async () => {
  mockFetch(({ url }) => {
    if (url.endsWith('/token/')) return { json: { access: 'tok-1', access_expires: 3600 } };
    return { json: { reference: 'ref-c', status: 'PENDING', ussd_code: '*123#' } };
  });

  const result = await paymentService.initiateProvider({
    provider: 'campay',
    phoneNumber: '237655123456',
    amount: 500,
    reference: 'ref-c'
  });

  assert.equal(result.redirect, false);
  assert.equal(result.ussdCode, '*123#');
});

test('checkProviderStatus: paystack verify maps success', async () => {
  process.env.PAYSTACK_SECRET_KEY = 'pk_test_1';
  mockFetch(({ url }) => {
    if (url.includes('/transaction/verify/ref-ps')) {
      return { json: { status: true, data: { status: 'success' } } };
    }
    throw new Error(`unexpected url ${url}`);
  });

  const result = await paymentService.checkProviderStatus({ provider: 'paystack', providerRef: 'ref-ps' });
  assert.deepEqual(result, { status: 'SUCCESS', reference: 'ref-ps' });
});

test('checkProviderStatus: stripe session paid maps success', async () => {
  process.env.STRIPE_SECRET_KEY = 'sk_test_1';
  mockFetch(({ url }) => {
    if (url.includes('/v1/checkout/sessions/cs_test_1')) {
      return { json: { id: 'cs_test_1', payment_status: 'paid' } };
    }
    throw new Error(`unexpected url ${url}`);
  });

  const result = await paymentService.checkProviderStatus({ provider: 'stripe', providerRef: 'cs_test_1' });
  assert.deepEqual(result, { status: 'SUCCESS', sessionId: 'cs_test_1' });
});

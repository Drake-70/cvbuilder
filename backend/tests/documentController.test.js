const { test, mock } = require('node:test');
const assert = require('node:assert/strict');

const User = require('../models/User');
const TailoredDocument = require('../models/TailoredDocument');
const documentService = require('../services/documentService');

function loadController() {
  return require('../controllers/documentController');
}

test.afterEach(() => {
  mock.restoreAll();
  delete require.cache[require.resolve('../controllers/documentController')];
});

test('watermarkTextFor returns the exact source strings (drift guard)', () => {
  const { watermarkTextFor } = loadController();
  assert.equal(watermarkTextFor('fr'), 'APERÇU GRATUIT');
  assert.equal(watermarkTextFor('en'), 'FREE PREVIEW');
  assert.equal(watermarkTextFor('xx'), 'FREE PREVIEW');
});

test('frontend watermark labels match backend watermark text (drift guard)', () => {
  const en = require('../../frontend/src/locales/en/common.json');
  const fr = require('../../frontend/src/locales/fr/common.json');
  const { watermarkTextFor } = loadController();
  assert.equal(en.watermark_label, watermarkTextFor('en'));
  assert.equal(fr.watermark_label, watermarkTextFor('fr'));
});

test('resolveAccess: active subscription is never watermarked', async () => {
  mock.method(User, 'findById', async () => ({ subscriptionStatus: 'active', freeDocumentCredits: 0 }));
  const { resolveAccess } = loadController();
  assert.deepEqual(await resolveAccess('u1', null), { watermarked: false });
});

test('resolveAccess: free credits are consumed and not watermarked', async () => {
  let updated = null;
  mock.method(User, 'findById', async () => ({ subscriptionStatus: 'none', freeDocumentCredits: 2 }));
  mock.method(User, 'findByIdAndUpdate', async (id, update) => { updated = update; return {}; });
  const { resolveAccess } = loadController();
  assert.deepEqual(await resolveAccess('u1', null), { watermarked: false });
  assert.deepEqual(updated, { $inc: { freeDocumentCredits: -1 } });
});

test('resolveAccess: no credits and no paid doc -> watermarked', async () => {
  mock.method(User, 'findById', async () => ({ subscriptionStatus: 'none', freeDocumentCredits: 0 }));
  mock.method(TailoredDocument, 'findOne', async () => null);
  const { resolveAccess } = loadController();
  assert.deepEqual(await resolveAccess('u1', 'd1'), { watermarked: true });
});

test('resolveAccess: owners paid doc bypasses the watermark', async () => {
  mock.method(User, 'findById', async () => ({ subscriptionStatus: 'none', freeDocumentCredits: 0 }));
  mock.method(TailoredDocument, 'findOne', async (q) => (q.userId === 'u1' ? { paid: true } : null));
  const { resolveAccess } = loadController();
  assert.deepEqual(await resolveAccess('u1', 'd1'), { watermarked: false });
});

test('resolveAccess: another users paid doc does NOT bypass the watermark', async () => {
  mock.method(User, 'findById', async () => ({ subscriptionStatus: 'none', freeDocumentCredits: 0 }));
  mock.method(TailoredDocument, 'findOne', async (q) => (q.userId === 'u2' ? { paid: true } : null));
  const { resolveAccess } = loadController();
  assert.deepEqual(await resolveAccess('u1', 'd1'), { watermarked: true });
});

// --- shared downloads ---------------------------------------------------------
//
// The share link has no signed-in viewer, so resolveAccess does not apply. These
// pin the rule that replaced the one that shipped nothing: the owner's
// subscription and the document's paid flag carry across, the owner's free
// credits do not, and an owner who cannot be found fails closed.

test('resolveSharedAccess: a paid document is clean for an anonymous viewer', async () => {
  mock.method(User, 'findById', async () => ({ subscriptionStatus: 'none', freeDocumentCredits: 0 }));
  const { resolveSharedAccess } = loadController();
  assert.deepEqual(await resolveSharedAccess({ paid: true, userId: 'u1' }), { watermarked: false });
});

test('resolveSharedAccess: the owners subscription carries to the shared download', async () => {
  mock.method(User, 'findById', async () => ({ subscriptionStatus: 'active', freeDocumentCredits: 0 }));
  const { resolveSharedAccess } = loadController();
  assert.deepEqual(await resolveSharedAccess({ paid: false, userId: 'u1' }), { watermarked: false });
});

test('resolveSharedAccess: owners free credits do NOT make the shared download clean', async () => {
  // The regression. A balance of one used to launder unlimited clean files for
  // everyone the link was sent to, because the shared path had no check at all.
  let decremented = false;
  mock.method(User, 'findById', async () => ({ subscriptionStatus: 'none', freeDocumentCredits: 5 }));
  mock.method(User, 'findByIdAndUpdate', async () => { decremented = true; return {}; });
  const { resolveSharedAccess } = loadController();

  assert.deepEqual(await resolveSharedAccess({ paid: false, userId: 'u1' }), { watermarked: true });
  // And nothing was spent: an unauthenticated, unrated GET must not be able to
  // move the owner's balance.
  assert.equal(decremented, false);
});

test('resolveSharedAccess: an owner who cannot be found fails closed', async () => {
  mock.method(User, 'findById', async () => null);
  const { resolveSharedAccess } = loadController();
  assert.deepEqual(await resolveSharedAccess({ paid: false, userId: 'gone' }), { watermarked: true });
});

function sharedDownloadRes() {
  const headers = {};
  const state = { body: null };
  const res = {
    setHeader: (k, v) => { headers[k] = v; },
    send: (body) => { state.body = body; },
    status: () => res,
    json: () => {}
  };
  return { res, headers, state };
}

function sharedDoc(overrides = {}) {
  return {
    shareToken: 'tok',
    userId: 'u1',
    paid: false,
    tailoredContent: { name: 'Ann' },
    coverLetter: '',
    language: 'en',
    template: 'modern',
    downloadCount: 0,
    save: async () => {},
    ...overrides
  };
}

test('downloadSharedDocument watermarks an unpaid owners document', async () => {
  let watermarkArg = 'sentinel';
  mock.method(documentService, 'generateDocx', async (_cv, _cl, _lang, _tpl, watermark) => {
    watermarkArg = watermark;
    return Buffer.from('docx-bytes');
  });
  // Credits are present on purpose: having them must not change the outcome.
  mock.method(User, 'findById', async () => ({ subscriptionStatus: 'none', freeDocumentCredits: 3 }));
  mock.method(TailoredDocument, 'findOne', async () => sharedDoc());

  const controller = loadController();
  const { res, headers, state } = sharedDownloadRes();
  const req = { params: { token: 'tok' }, query: { format: 'docx' } };

  await controller.downloadSharedDocument(req, res, () => { throw new Error('next should not be called'); });

  assert.equal(headers['X-Watermarked'], 'true');
  assert.equal(watermarkArg, 'FREE PREVIEW');
  assert.deepEqual(state.body, Buffer.from('docx-bytes'));
});

test('downloadSharedDocument renders clean for a subscriber', async () => {
  let watermarkArg = 'sentinel';
  mock.method(documentService, 'generateDocx', async (_cv, _cl, _lang, _tpl, watermark) => {
    watermarkArg = watermark;
    return Buffer.from('docx-bytes');
  });
  mock.method(User, 'findById', async () => ({ subscriptionStatus: 'active', freeDocumentCredits: 0 }));
  mock.method(TailoredDocument, 'findOne', async () => sharedDoc());

  const controller = loadController();
  const { res, headers } = sharedDownloadRes();
  const req = { params: { token: 'tok' }, query: { format: 'docx' } };

  await controller.downloadSharedDocument(req, res, () => { throw new Error('next should not be called'); });

  assert.equal(headers['X-Watermarked'], 'false');
  assert.equal(watermarkArg, null);
});

test('generateDocument sets X-Watermarked true and passes the watermark text for unpaid users', async () => {
  let watermarkArg = 'sentinel';
  mock.method(documentService, 'generateDocx', async (_cv, _cl, _lang, _tpl, watermark) => {
    watermarkArg = watermark;
    return Buffer.from('docx-bytes');
  });
  mock.method(User, 'findById', async () => ({ subscriptionStatus: 'none', freeDocumentCredits: 0 }));
  const controller = loadController();

  const headers = {};
  let sent = null;
  const res = {
    setHeader: (k, v) => { headers[k] = v; },
    send: (body) => { sent = body; },
    status: (code) => res,
    json: () => {}
  };
  const req = {
    user: { _id: 'u1', name: 'Ann', email: 'ann@x.com' },
    body: { tailoredCV: { name: 'Ann' }, language: 'en', template: 'modern', format: 'docx', documentId: null }
  };

  await controller.generateDocument(req, res, () => { throw new Error('next should not be called'); });

  assert.equal(headers['X-Watermarked'], 'true');
  assert.equal(watermarkArg, 'FREE PREVIEW');
  assert.deepEqual(sent, Buffer.from('docx-bytes'));
});

test('generateDocument sets X-Watermarked false and passes null watermark for subscribers', async () => {
  let watermarkArg = 'sentinel';
  mock.method(documentService, 'generateDocx', async (_cv, _cl, _lang, _tpl, watermark) => {
    watermarkArg = watermark;
    return Buffer.from('docx-bytes');
  });
  mock.method(User, 'findById', async () => ({ subscriptionStatus: 'active', freeDocumentCredits: 0 }));
  const controller = loadController();

  const headers = {};
  const res = {
    setHeader: (k, v) => { headers[k] = v; },
    send: () => {},
    status: (code) => res,
    json: () => {}
  };
  const req = {
    user: { _id: 'u1', name: 'Ann', email: 'ann@x.com' },
    body: { tailoredCV: { name: 'Ann' }, language: 'en', template: 'modern', format: 'docx', documentId: null }
  };

  await controller.generateDocument(req, res, () => { throw new Error('next should not be called'); });

  assert.equal(headers['X-Watermarked'], 'false');
  assert.equal(watermarkArg, null);
});

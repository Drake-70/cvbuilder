const { test, expect } = require('@playwright/test');
const { markEmailVerified } = require('./helpers/verifiedUser');
const { csrfToken } = require('./helpers/csrf');
const { docxContainsText } = require('./helpers/docx');

const MINIMAL_CV = {
  name: 'Test User',
  summary: 'Experienced professional in sales and marketing in Douala.',
  skills: ['Sales', 'Marketing'],
  experience: [],
  education: []
};

// This spec previously asserted a 402 on the second download. Nothing in the codebase
// can produce one for a document: requirePayment is the only source of that status and it
// is not mounted on any route, and resolveAccess ends in `return { watermarked: true }`
// rather than a refusal. So out of credits gets a watermarked preview, and the header
// X-Watermarked is how the caller is told. The test asserted an intent that was never
// implemented; these assertions describe the contract that is.
//
// The credit is asserted before and after, because "still 1" would also satisfy a
// version of this that never spent anything.
test.describe('free download credit flow', () => {
  test('grants 1 credit, spends it on the first download, then watermarks', async ({ request }) => {
    const ctx = request;
    // Primed via GET /api/auth/me rather than GET /api/health: the health route is
    // mounted ahead of the CSRF middleware, so it never issues the cookie and this
    // spec's first write went back as a bare 403. See helpers/csrf.
    const headers = { 'X-CSRF-Token': await csrfToken(ctx) };
    const email = `pw-${Date.now()}@test.com`;

    const reg = await ctx.post('/api/auth/register', {
      headers,
      data: { name: 'Credit Tester', email, password: 'pw-test-123' }
    });
    expect(reg.ok()).toBeTruthy();
    // Document generation is gated on emailVerified, so without this the first
    // generate is 403 rather than the 200 that spends the credit.
    await markEmailVerified(email);

    const me = await ctx.get('/api/auth/me');
    expect(me.ok()).toBeTruthy();
    expect((await me.json()).user.freeDocumentCredits).toBe(1);

    const gen = await ctx.post('/api/document/generate', {
      headers,
      data: { tailoredCV: MINIMAL_CV, language: 'en', template: 'modern' }
    });
    expect(gen.status()).toBe(200);
    expect(gen.headers()['content-type']).toContain('wordprocessingml');
    // The credit bought an unwatermarked document, which is the whole point of spending
    // it. Asserted explicitly because "200 with a credit left over" would also pass the
    // status check above.
    expect(gen.headers()['x-watermarked']).toBe('false');
    expect(await docxContainsText(await gen.body(), 'FREE PREVIEW')).toBe(false);

    const me2 = await ctx.get('/api/auth/me');
    expect((await me2.json()).user.freeDocumentCredits).toBe(0);

    // Out of credits: still served, but watermarked. Checked on the header and then on
    // the document itself, since a header can be set without the watermark ever reaching
    // the rendered file.
    const gen2 = await ctx.post('/api/document/generate', {
      headers,
      data: { tailoredCV: MINIMAL_CV, language: 'en', template: 'modern' }
    });
    expect(gen2.status()).toBe(200);
    expect(gen2.headers()['x-watermarked']).toBe('true');
    expect(await docxContainsText(await gen2.body(), 'FREE PREVIEW')).toBe(true);

    // A watermarked render must not silently cost another credit, or the balance would
    // drift below zero across repeated downloads.
    const me3 = await ctx.get('/api/auth/me');
    expect((await me3.json()).user.freeDocumentCredits).toBe(0);

    await ctx.dispose();
  });
});

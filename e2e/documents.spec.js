const { test, expect } = require('@playwright/test');
const { markEmailVerified } = require('./helpers/verifiedUser');
const { copyApiCookiesToBrowser, expectInsideProtectedRoute } = require('./helpers/browserSession');
const { csrfToken } = require('./helpers/csrf');

test.describe('document lifecycle', () => {
  test('save, list, view, share, update status, and delete a tailored document', async ({ request }) => {
    const ctx = request;
    const email = `pw-${Date.now()}@test.com`;

    const reg = await ctx.post('/api/auth/register', {
      data: { name: 'Doc Tester', email, password: 'pw-test-123' }
    });
    expect(reg.ok()).toBeTruthy();
    // /api/document/save is gated on emailVerified, so a brand new account would get
    // 403 here rather than the 201 this flow is about.
    await markEmailVerified(email);

    const me = await ctx.get('/api/auth/me');
    expect(me.ok()).toBeTruthy();
    const headers = { 'X-CSRF-Token': await csrfToken(ctx) };

    const payload = {
      baseCvId: null,
      jobTitle: 'Marketing Officer',
      jobDescription: 'Manage social media and support the sales team in Douala.',
      tailoredContent: {
        name: 'Doc Tester',
        summary: 'Marketing professional in Douala.',
        skills: ['Social Media', 'Microsoft Office'],
        experience: [{ title: 'Assistant', company: 'Local Co', dates: '2023-2024', bullets: ['Ran campaigns'] }]
      },
      coverLetter: 'Dear Hiring Manager,\n\nI am a great fit.',
      gapAnalysis: ['More quantifiable results'],
      language: 'en',
      template: 'modern'
    };

    const save = await ctx.post('/api/document/save', { headers, data: payload });
    expect(save.status()).toBe(201);
    const saved = await save.json();
    const docId = saved._id;
    expect(docId).toBeTruthy();

    const list = await ctx.get('/api/document/list');
    expect(list.ok()).toBeTruthy();
    const docs = await list.json();
    expect(docs.some((d) => d._id === docId)).toBe(true);

    const detail = await ctx.get(`/api/document/${docId}`);
    expect(detail.ok()).toBeTruthy();
    const detailBody = await detail.json();
    expect(detailBody.jobTitle).toBe('Marketing Officer');
    expect(detailBody.coverLetter).toContain('I am a great fit');

    const share = await ctx.post(`/api/document/${docId}/share`, { headers });
    expect(share.ok()).toBeTruthy();
    const shareBody = await share.json();
    expect(shareBody.shareToken).toBeTruthy();

    const shared = await ctx.get(`/api/document/shared/${shareBody.shareToken}`);
    expect(shared.ok()).toBeTruthy();
    const sharedBody = await shared.json();
    expect(sharedBody.jobTitle).toBe('Marketing Officer');

    const statusUpdate = await ctx.patch(`/api/document/${docId}/status`, {
      headers,
      data: { applicationStatus: 'applied', companyApplied: 'TechCorp Douala' }
    });
    expect(statusUpdate.ok()).toBeTruthy();
    const updated = await statusUpdate.json();
    expect(updated.applicationStatus).toBe('applied');
    expect(updated.companyApplied).toBe('TechCorp Douala');
    expect(updated.appliedAt).toBeTruthy();

    const del = await ctx.delete(`/api/document/${docId}`, { headers });
    expect(del.ok()).toBeTruthy();

    const list2 = await ctx.get('/api/document/list');
    const docs2 = await list2.json();
    expect(docs2.some((d) => d._id === docId)).toBe(false);
  });
});

// The rest of this file drives the API directly, which left /documents/:id with no browser
// coverage at all. That gap is not theoretical: the page shipped a temporal-dead-zone crash
// ("Cannot access 'handleDownload' before initialization") that blanked it on every visit,
// and every API-level assertion here still passed. A page can satisfy its entire API contract
// and render nothing whatsoever.
test.describe('document detail page', () => {
  test('renders a saved document in the browser without throwing', async ({ page, request }) => {
    // Uncaught exceptions, collected across the whole navigation. This is the assertion
    // that catches a render-time crash; without it a blank page still "passes" any check
    // that only asks whether some element is absent.
    const pageErrors = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));

    const email = `pw-page-${Date.now()}@test.com`;
    const reg = await request.post('/api/auth/register', {
      data: { name: 'Page Tester', email, password: 'pw-test-123' }
    });
    expect(reg.ok()).toBeTruthy();
    await markEmailVerified(email);

    const save = await request.post('/api/document/save', {
      headers: { 'X-CSRF-Token': await csrfToken(request) },
      data: {
        baseCvId: null,
        jobTitle: 'Marketing Officer',
        jobDescription: 'Manage social media and support the sales team in Douala.',
        tailoredContent: {
          name: 'Page Tester',
          summary: 'Marketing professional in Douala.',
          skills: ['Social Media', 'Microsoft Office'],
          experience: [{ title: 'Assistant', company: 'Local Co', dates: '2023-2024', bullets: ['Ran campaigns'] }]
        },
        coverLetter: 'Dear Hiring Manager,\n\nI am a great fit.',
        gapAnalysis: ['More quantifiable results'],
        language: 'en',
        template: 'modern'
      }
    });
    expect(save.status()).toBe(201);
    const docId = (await save.json())._id;

    await copyApiCookiesToBrowser(request, page);
    await page.goto(`/documents/${docId}`);
    await expectInsideProtectedRoute(page, `/documents/${docId}`);

    // Asserted on values that came from the document, not on UI copy. Translations change,
    // and a test that fails when a label is reworded trains people to ignore it.
    //
    // Named rather than a bare level-1 query: the rendered CV carries its own h1 (the
    // candidate's name), so `heading level 1` matches two elements and fails on strict
    // mode. Naming the job title also pins it to the page heading instead of the
    // document body.
    //
    // The timeout is explicit because the default 5s is not enough here on a cold run.
    // /documents/:id is a lazily-imported route, so the first visit in a fresh checkout
    // has to wait for Vite to transform that chunk and for the document fetch to land on
    // top of it. Measured: the heading was still absent at 5s on a cold cache and the
    // test passed on retry, so this is transform latency rather than a rendering fault.
    // Scoped to this test rather than raised globally, since a blanket expect timeout
    // would also hide a genuinely slow interaction everywhere else.
    await expect(
      page.getByRole('heading', { level: 1, name: 'Marketing Officer' })
    ).toBeVisible({ timeout: 15000 });
    await expect(
      page.getByText('Manage social media and support the sales team in Douala.')
    ).toBeVisible({ timeout: 15000 });

    expect(pageErrors, `uncaught errors while rendering the document page:\n${pageErrors.join('\n')}`).toEqual([]);
  });

  // The free-preview overlay used to be drawn by CVPreview and nowhere else, so an
  // out-of-credits account saw a watermarked CV and a plainly readable cover letter
  // sitting right beside it -- the upsell described half the page it was on. Covered
  // here because this is presentational and nothing in the API suite could notice it:
  // the download was correctly watermarked either way, which is precisely how the
  // mismatch survived.
  test('marks the cover letter along with the CV once the free credit is spent', async ({ page, request }) => {
    const pageErrors = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));

    const email = `pw-wm-${Date.now()}@test.com`;
    const reg = await request.post('/api/auth/register', {
      data: { name: 'Watermark Tester', email, password: 'pw-test-123' }
    });
    expect(reg.ok()).toBeTruthy();
    await markEmailVerified(email);

    const headers = { 'X-CSRF-Token': await csrfToken(request) };

    // Spends the one free credit a new account starts with. Without this the page
    // renders both documents unwatermarked and the assertions below would pass
    // even if the cover letter had no overlay code at all -- a test that cannot fail.
    const gen = await request.post('/api/document/generate', {
      headers,
      data: { tailoredCV: { name: 'Watermark Tester' }, language: 'en', template: 'modern' }
    });
    expect(gen.status()).toBe(200);
    expect(gen.headers()['x-watermarked']).toBe('false');

    const me = await request.get('/api/auth/me');
    expect((await me.json()).user.freeDocumentCredits).toBe(0);

    const save = await request.post('/api/document/save', {
      headers,
      data: {
        baseCvId: null,
        jobTitle: 'Marketing Officer',
        jobDescription: 'Manage social media and support the sales team in Douala.',
        tailoredContent: {
          name: 'Watermark Tester',
          summary: 'Marketing professional in Douala.',
          skills: ['Social Media'],
          experience: []
        },
        coverLetter: 'Dear Hiring Manager,\n\nI am a great fit.',
        gapAnalysis: [],
        language: 'en',
        template: 'modern'
      }
    });
    expect(save.status()).toBe(201);
    const docId = (await save.json())._id;

    await copyApiCookiesToBrowser(request, page);
    await page.goto(`/documents/${docId}`);
    await expectInsideProtectedRoute(page, `/documents/${docId}`);

    // The whole invariant is the count: exactly two overlays, one per document.
    // Asserted as a pair with the per-container check below rather than a bare
    // "at least one", which the CV alone would satisfy.
    const overlays = page.locator('.cv-watermark');
    await expect(overlays).toHaveCount(2, { timeout: 15000 });
    await expect(page.locator('.cv-preview-wrapper .cv-watermark')).toHaveCount(1);
    await expect(page.locator('.card').filter({ hasText: 'Dear Hiring Manager' }).locator('.cv-watermark')).toHaveCount(1);

    // The label, not just the box. The overlay is decorative enough that a node
    // with no text in it would still satisfy every assertion above, and the string
    // has to match what the backend stamps into the file -- see the drift guards
    // in backend/tests/documentController.test.js.
    await expect(page.locator('.cv-watermark-label')).toHaveText(['FREE PREVIEW', 'FREE PREVIEW']);

    expect(pageErrors, `uncaught errors while rendering the watermarked document:\n${pageErrors.join('\n')}`).toEqual([]);
  });

  test('shows the not-found state instead of crashing on an unknown id', async ({ page, request }) => {
    const pageErrors = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));

    const email = `pw-404-${Date.now()}@test.com`;
    await request.post('/api/auth/register', {
      data: { name: 'Missing Tester', email, password: 'pw-test-123' }
    });
    await markEmailVerified(email);
    await copyApiCookiesToBrowser(request, page);

    // A valid 24-hex ObjectId that belongs to nobody, so the API answers 404 rather
    // than failing to cast.
    await page.goto('/documents/000000000000000000000000');

    // The URL assertion is load-bearing. An anonymous browser is redirected to /login,
    // which renders its own h2 in the split-screen panel -- so the previous version of
    // this test, asserting only that "an h2 is visible", was green while the 404 branch
    // of the page ran zero times.
    await expectInsideProtectedRoute(page, '/documents/000000000000000000000000');
    await expect(page.getByRole('heading', { level: 2, name: 'Document not found.' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Dashboard', exact: true })).toBeVisible();

    expect(pageErrors, `uncaught errors on the not-found path:\n${pageErrors.join('\n')}`).toEqual([]);
  });
});

const { test, expect } = require('@playwright/test');

const MINIMAL_CV = {
  name: 'Test User',
  summary: 'Experienced professional in sales and marketing in Douala.',
  skills: ['Sales', 'Marketing'],
  experience: [],
  education: []
};

async function csrfToken(ctx) {
  const { cookies } = await ctx.storageState();
  return cookies.find((c) => c.name === 'csrf-token')?.value || '';
}

test.describe('free download credit flow', () => {
  test('grants 1 credit, consumes it on first download, then blocks with 402', async ({ request }) => {
    const ctx = request;
    await ctx.get('/api/health');
    const headers = { 'X-CSRF-Token': await csrfToken(ctx) };
    const email = `pw-${Date.now()}@test.com`;

    const reg = await ctx.post('/api/auth/register', {
      headers,
      data: { name: 'Credit Tester', email, password: 'pw-test-123' }
    });
    expect(reg.ok()).toBeTruthy();

    const me = await ctx.get('/api/auth/me');
    expect(me.ok()).toBeTruthy();
    expect((await me.json()).user.freeDocumentCredits).toBe(1);

    const gen = await ctx.post('/api/document/generate', {
      headers,
      data: { tailoredCV: MINIMAL_CV, language: 'en', template: 'modern' }
    });
    expect(gen.status()).toBe(200);
    expect(gen.headers()['content-type']).toContain('wordprocessingml');

    const me2 = await ctx.get('/api/auth/me');
    expect((await me2.json()).user.freeDocumentCredits).toBe(0);

    const gen2 = await ctx.post('/api/document/generate', {
      headers,
      data: { tailoredCV: MINIMAL_CV, language: 'en', template: 'modern' }
    });
    expect(gen2.status()).toBe(402);
    expect((await gen2.json()).error).toMatch(/Payment required/i);

    const me3 = await ctx.get('/api/auth/me');
    expect((await me3.json()).user.freeDocumentCredits).toBe(0);

    await ctx.dispose();
  });
});

const { test, expect } = require('@playwright/test');
const { request } = require('playwright');

test.describe('referral program', () => {
  test('grants a free credit to both parties and rejects misuse', async () => {
    const stamp = Date.now();
    const baseURL = 'http://localhost:5173';
    const ctxA = await request.newContext({ baseURL });
    const ctxB = await request.newContext({ baseURL });

    const emailA = `pw-${stamp}a@test.com`;
    const emailB = `pw-${stamp}b@test.com`;

    const regA = await ctxA.post('/api/auth/register', {
      data: { name: 'Referrer A', email: emailA, password: 'pw-test-123' }
    });
    expect(regA.ok()).toBeTruthy();

    const statsA = await ctxA.get('/api/referrals/stats');
    expect(statsA.ok()).toBeTruthy();
    const { code } = await statsA.json();
    expect(code).toBeTruthy();

    const regB = await ctxB.post('/api/auth/register', {
      data: { name: 'Referrer B', email: emailB, password: 'pw-test-123' }
    });
    expect(regB.ok()).toBeTruthy();

    const meB = await ctxB.get('/api/auth/me');
    expect(meB.ok()).toBeTruthy();
    expect((await meB.json()).user.freeDocumentCredits).toBe(1);
    const csrfB = (await ctxB.storageState()).cookies.find((c) => c.name === 'csrf-token')?.value || '';
    const headersB = { 'X-CSRF-Token': csrfB };

    const apply = await ctxB.post('/api/referrals/apply', { headers: headersB, data: { code } });
    expect(apply.status()).toBe(200);

    const statsA2 = await ctxA.get('/api/referrals/stats');
    const statsA2Body = await statsA2.json();
    expect(statsA2Body.totalReferrals).toBe(1);
    expect(statsA2Body.credits).toBe(2);

    const meB2 = await ctxB.get('/api/auth/me');
    expect((await meB2.json()).user.freeDocumentCredits).toBe(2);

    const again = await ctxB.post('/api/referrals/apply', { headers: headersB, data: { code } });
    expect(again.status()).toBe(400);
    expect((await again.json()).error).toMatch(/already been used/i);

    const csrfA = (await ctxA.storageState()).cookies.find((c) => c.name === 'csrf-token')?.value || '';
    const selfApply = await ctxA.post('/api/referrals/apply', {
      headers: { 'X-CSRF-Token': csrfA },
      data: { code }
    });
    expect(selfApply.status()).toBe(400);
    expect((await selfApply.json()).error).toMatch(/your own referral code/i);

    await ctxA.dispose();
    await ctxB.dispose();
  });
});

const { test, expect } = require('@playwright/test');

test.describe('document lifecycle', () => {
  test('save, list, view, share, update status, and delete a tailored document', async ({ request }) => {
    const ctx = request;
    const email = `pw-${Date.now()}@test.com`;

    const reg = await ctx.post('/api/auth/register', {
      data: { name: 'Doc Tester', email, password: 'pw-test-123' }
    });
    expect(reg.ok()).toBeTruthy();

    const me = await ctx.get('/api/auth/me');
    expect(me.ok()).toBeTruthy();
    const csrf = (await ctx.storageState()).cookies.find((c) => c.name === 'csrf-token')?.value || '';
    const headers = { 'X-CSRF-Token': csrf };

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

const path = require('path');
const { test, expect } = require('@playwright/test');

const SHOT_DIR = path.join(process.env.LOCALAPPDATA || process.env.TEMP, 'Temp', 'opencode', 'gap-highlight-shots');

const ORIGINAL_STRUCTURED = {
  name: 'MARIE NKAMGA',
  email: 'marie.nkamga@email.com',
  phone: '+237 699001122',
  location: 'Douala, Cameroon',
  summary: 'Friendly customer service representative with experience handling phone support and resolving customer issues.',
  experience: [
    {
      title: 'Customer Service Agent',
      company: 'Orange Cameroon',
      dates: '2019 - 2022',
      bullets: ['Answered customer calls and resolved billing issues', 'Provided phone support for account questions']
    }
  ],
  education: [
    {
      institution: 'Institut Universitaire de la Côte',
      degree: 'BTS in Business Administration',
      dates: '2017 - 2019',
      details: 'Focus on client relations and communication.'
    }
  ],
  skills: ['Customer Service', 'Communication', 'Phone Support', 'Microsoft Office'],
  languages: ['French', 'English'],
  additionalSections: []
};

const JOB_DESCRIPTION = [
  'We are looking for a Customer Service Representative.',
  'Responsibilities: handle customer calls, provide phone support, and maintain records using CRM software.',
  'Fluency in French and English is required. Strong communication skills are a plus.'
].join('\n');

const MOCK_TAILOR = {
  tailoredCV: {
    name: 'MARIE NKAMGA',
    email: 'marie.nkamga@email.com',
    phone: '+237 699001122',
    location: 'Douala, Cameroon',
    summary:
      'Friendly customer service representative with proven phone support experience, committed to resolving customer issues with care and clear communication.',
    experience: [
      {
        title: 'Customer Service Agent',
        company: 'Orange Cameroon',
        dates: '2019 - 2022',
        bullets: [
          'Answered customer calls and resolved billing issues for account holders',
          'Delivered phone support and clear communication in French and English'
        ]
      }
    ],
    education: [
      {
        degree: 'BTS in Business Administration',
        institution: 'Institut Universitaire de la Côte',
        dates: '2017 - 2019',
        details: 'Focus on client relations and communication.'
      }
    ],
    skills: ['Customer Service', 'Communication', 'Phone Support', 'Microsoft Office'],
    additionalSections: [{ title: 'Languages', content: 'French (native), English (professional)' }]
  },
  coverLetter:
    'Dear Hiring Manager,\n\nI am applying for the Customer Service Representative position. My experience in phone support and customer care makes me a strong fit.\n\nSincerely,\nMarie Nkamga',
  gapAnalysis: [
    "Emphasize 'customer service' and 'phone support' in your summary and skills section.",
    "Add 'CRM software' experience to your skills — it's missing from your CV."
  ]
};

test.describe('gap-highlight diff', () => {
  test('build path shows gaps first, then structured Before above After on A4 sheets', async ({ page }) => {
    const fulfillJson = (route, body) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

    await page.route('**/api/cv/build', (route) => fulfillJson(route, ORIGINAL_STRUCTURED));
    await page.route('**/api/cv/skills*', (route) =>
      fulfillJson(route, { skills: ['Customer Service', 'Communication', 'Phone Support', 'Microsoft Office', 'CRM'] })
    );
    await page.route('**/api/cv/save', (route) => fulfillJson(route, { _id: 'mock-cv-id' }));
    await page.route('**/api/tailor', (route) => fulfillJson(route, MOCK_TAILOR));
    await page.route('**/api/document/save', (route) => fulfillJson(route, { _id: 'mock-doc-id' }));
    await page.route('**/api/drafts', (route) => {
      const m = route.request().method();
      return fulfillJson(route, m === 'GET' ? { exists: false } : { exists: true });
    });

    await page.goto('/register');
    const email = `gaphl-${Date.now()}@test.com`;
    await page.fill('#register-name', 'Gap Highlight Tester');
    await page.fill('#register-email', email);
    await page.fill('#register-password', 'gap-pass-123');
    await page.fill('#register-confirm', 'gap-pass-123');
    await page.getByRole('button', { name: 'Create Account', exact: true }).click();
    await page.waitForURL(/\/dashboard/);

    await page.goto('/tailor');
    await page.getByRole('button', { name: /I don't have a CV yet/ }).click();
    await page.fill('#fullName', 'Marie Nkamga');
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await page.getByRole('button', { name: /Submit/ }).click();

    await page.waitForSelector('.jd-form textarea');
    await page.locator('.jd-form textarea').fill(JOB_DESCRIPTION);
    await page.getByRole('button', { name: /Submit/ }).click();

    await page.waitForSelector('.result-tabs');
    await page.getByRole('button', { name: /Gap Analysis/ }).click();
    await page.waitForSelector('.result-content');
    await page.waitForSelector('.a4-sheet');

    const sheets = page.locator('.a4-sheet');
    await expect(sheets).toHaveCount(2);
    await expect(page.locator('.a4-sheet .cv-preview')).toHaveCount(2);
    await expect(page.locator('.cv-preview--plain')).toHaveCount(0);

    const beforeText = (await sheets.first().innerText()).trim();
    expect(beforeText.startsWith('{')).toBe(false);

    const beforeBox = await sheets.first().boundingBox();
    const afterBox = await sheets.nth(1).boundingBox();
    expect(beforeBox.y).toBeLessThan(afterBox.y);

    const chips = page.locator('.result-content div.flex.flex-wrap.gap-2 button');
    await expect(chips).toHaveCount(4);

    // Matched gap: green marks in After, amber marks in Before.
    await chips.nth(2).click();
    await expect(page.locator('.a4-sheet mark.cv-hl-new')).toHaveCount(5);
    await expect(page.locator('.a4-sheet mark.cv-hl-before')).toHaveCount(5);

    // Unmatched gap: honest "Add this to apply" state, zero fabrication.
    await chips.nth(3).click();
    await expect(page.locator('.result-content').getByText('Add this to apply')).toHaveCount(1);
    await expect(page.locator('.a4-sheet mark.cv-hl-new')).toHaveCount(0);

    // "All" chip re-highlights every matched term.
    await chips.nth(0).click();
    await expect(page.locator('.a4-sheet mark.cv-hl-new')).toHaveCount(5);

    await page.screenshot({ path: path.join(SHOT_DIR, 'gap-highlight-final.png') });
  });
});

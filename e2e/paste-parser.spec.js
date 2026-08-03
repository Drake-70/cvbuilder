const path = require('path');
const { test, expect } = require('@playwright/test');

const SHOT_DIR = path.join(process.env.LOCALAPPDATA || process.env.TEMP, 'Temp', 'opencode', 'paste-parse-shots');

const PASTED_CV = `MARIE NKAMGA
Douala, Cameroon
marie.nkamga@email.com
+237 699 001 122

SUMMARY
Friendly customer service representative with experience handling phone support and resolving customer issues.

EXPERIENCE
Customer Service Agent - Orange Cameroon (2019 - 2022)
- Answered customer calls and resolved billing issues
- Provided phone support for account questions

EDUCATION
BTS in Business Administration - Institut Universitaire (2017 - 2019)

SKILLS
Customer Service, Communication, Phone Support, Microsoft Office

LANGUAGES
French, English`;

const JOB_DESCRIPTION = [
  'We are looking for a Customer Service Representative.',
  'Responsibilities: handle customer calls, provide phone support, and maintain records using CRM software.',
  'Fluency in French and English is required. Strong communication skills are a plus.'
].join('\n');

const MOCK_TAILOR = {
  tailoredCV: {
    name: 'MARIE NKAMGA',
    email: 'marie.nkamga@email.com',
    phone: '+237 699 001 122',
    location: 'Douala, Cameroon',
    summary: 'Friendly customer service representative with proven phone support experience.',
    experience: [
      {
        title: 'Customer Service Agent',
        company: 'Orange Cameroon',
        dates: '2019 - 2022',
        bullets: ['Answered customer calls and resolved billing issues for account holders']
      }
    ],
    education: [
      { degree: 'BTS in Business Administration', institution: 'Institut Universitaire', dates: '2017 - 2019' }
    ],
    skills: ['Customer Service', 'Communication', 'Phone Support', 'Microsoft Office'],
    languages: ['French', 'English'],
    additionalSections: []
  },
  coverLetter: 'Dear Hiring Manager,\n\nI am applying for the Customer Service Representative position.\n\nSincerely,\nMarie Nkamga',
  gapAnalysis: [
    "Emphasize 'customer service' and 'phone support' in your summary and skills section.",
    "Add 'CRM software' experience to your skills — it's missing from your CV."
  ]
};

test.describe('paste-path CV parsing', () => {
  test('pasted CV is parsed into a structured Before sheet (real /api/cv/paste)', async ({ page }) => {
    const fulfillJson = (route, body) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

    // Hermetic: only the AI-tailor call is mocked; /api/cv/paste hits the REAL parser.
    await page.route('**/api/tailor', (route) => fulfillJson(route, MOCK_TAILOR));
    await page.route('**/api/cv/save', (route) => fulfillJson(route, { _id: 'mock-cv-id' }));
    await page.route('**/api/document/save', (route) => fulfillJson(route, { _id: 'mock-doc-id' }));
    await page.route('**/api/drafts', (route) => {
      const m = route.request().method();
      return fulfillJson(route, m === 'GET' ? { exists: false } : { exists: true });
    });

    await page.goto('/register');
    await page.fill('#register-name', 'Paste Parse Tester');
    await page.fill('#register-email', `pasteparse-${Date.now()}@test.com`);
    await page.fill('#register-password', 'paste-pass-123');
    await page.fill('#register-confirm', 'paste-pass-123');
    await page.getByRole('button', { name: 'Create Account', exact: true }).click();
    await page.waitForURL(/\/dashboard/);

    await page.goto('/tailor');
    await page.getByRole('button', { name: /I have a CV to upload/ }).click();
    await page.getByRole('button', { name: 'Paste text', exact: true }).click();
    await page.locator('.paste-area textarea').fill(PASTED_CV);
    await page.getByRole('button', { name: /Next/ }).click();

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
    expect(beforeText.toUpperCase().startsWith('MARIE NKAMGA')).toBe(true);
    expect(beforeText).not.toContain('{"');
    expect(beforeText).toMatch(/EXPERIENCE|Customer Service Agent/);

    await page.screenshot({ path: path.join(SHOT_DIR, 'paste-parsed.png') });
  });
});

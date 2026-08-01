const { test, expect } = require('@playwright/test');

test.describe('free ATS preview', () => {
  test('renders the preview and before/after sections on the landing page', async ({ page }) => {
    await page.goto('/');
    await expect(
      page.getByRole('heading', { name: 'See your real ATS match score — free' })
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'What a real tailoring looks like' })
    ).toBeVisible();
    await expect(page.getByText('ATS score 47').first()).toBeVisible();
    await expect(page.getByText('ATS score 92').first()).toBeVisible();
  });

  test('shows a validation error when inputs are too short', async ({ page }) => {
    await page.goto('/');
    const preview = page.locator('section[aria-labelledby="preview-heading"]');
    await preview.getByRole('button', { name: 'Analyze my CV for free' }).click();
    await expect(preview.getByRole('alert')).toBeVisible();
  });

  test('returns a real score for a pasted CV and job description', async ({ page }) => {
    await page.goto('/');
    const preview = page.locator('section[aria-labelledby="preview-heading"]');

    await preview.locator('#preview-cv').fill(
      'John Doe, Marketing Assistant in Douala. Managed social media for a small shop, handled customer inquiries, organized promotional events, wrote product descriptions. Proficient in Microsoft Office and Canva, speaks French and English.'
    );
    await preview.locator('#preview-jd').fill(
      'Marketing Assistant needed in Douala. Must manage social media, create marketing content, support the sales team, use Microsoft Office and Canva, and communicate in English and French.'
    );
    await preview.getByRole('button', { name: 'Analyze my CV for free' }).click();

    await expect(
      preview.getByRole('link', { name: /Unlock your full tailored CV/ })
    ).toBeVisible({ timeout: 60000 });
    await expect(preview.getByText(/ATS score of|keywords|skills|structure/).first()).toBeVisible();
  });
});

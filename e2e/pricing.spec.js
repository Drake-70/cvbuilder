const { test, expect } = require('@playwright/test');

test.describe('pricing page', () => {
  test('renders both pricing tiers', async ({ page }) => {
    await page.goto('/pricing');
    await expect(
      page.getByRole('heading', { name: 'Simple, transparent pricing' })
    ).toBeVisible();
    await expect(page.getByRole('heading', { name: 'One-time Download' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Monthly Subscription' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Pay & Download' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Subscribe Now' })).toBeVisible();
  });
});

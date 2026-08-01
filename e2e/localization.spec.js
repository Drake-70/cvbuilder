const { test, expect } = require('@playwright/test');

test.describe('localization', () => {
  test('renders French navigation when ?lang=fr is set', async ({ page }) => {
    await page.goto('/?lang=fr');
    const headerNav = page.getByRole('navigation', { name: 'Main navigation' });
    await expect(headerNav.getByRole('link', { name: 'Tarifs' })).toBeVisible();
    await expect(headerNav.getByRole('link', { name: 'À propos' })).toBeVisible();
    await expect(headerNav.getByRole('button', { name: 'EN' })).toBeVisible();
  });
});

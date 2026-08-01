const { test, expect, devices } = require('@playwright/test');

const mobile = { ...devices['Pixel 5'] };
delete mobile.defaultBrowserType;

test.describe('mobile navigation', () => {
  test.use({ ...mobile });

  test('opens the hamburger menu and routes to pricing', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Open menu' })).toBeVisible();
    await page.getByRole('button', { name: 'Open menu' }).click();

    const mobileNav = page.getByRole('navigation', { name: 'Mobile navigation' });
    await expect(mobileNav).toBeVisible();
    await mobileNav.getByRole('link', { name: 'Pricing' }).click();
    await expect(page).toHaveURL(/\/pricing$/);
  });

  test('routes to register from the mobile menu', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Open menu' }).click();
    await page
      .getByRole('navigation', { name: 'Mobile navigation' })
      .getByRole('link', { name: 'Register' })
      .click();
    await expect(page).toHaveURL(/\/register$/);
  });
});

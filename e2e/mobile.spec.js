const { test, expect, devices } = require('@playwright/test');

const mobile = { ...devices['Pixel 5'] };
delete mobile.defaultBrowserType;

// These tests start from /pricing rather than /.
//
// HomeRoute redirects mobile visitors away from the landing page -- a Pixel 5 matches
// its `max-width: 767px` media query, so '/' immediately navigates to /login (or
// /dashboard), and Header returns null on /login via HIDE_HEADER_PATHS. So a test that
// opened the menu on '/' was racing that redirect: the button resolved and looked
// clickable, then the header unmounted underneath it. Playwright reported that as
// "<html> intercepts pointer events" followed by "element was detached from the DOM",
// which reads like a CSS hit-testing bug and is not one.
//
// /pricing keeps the header mounted on a mobile viewport, so the menu is actually
// exercised rather than torn down mid-click.
const MOBILE_LANDING = '/pricing';

test.describe('mobile navigation', () => {
  test.use({ ...mobile });

  test('opens the hamburger menu and routes to pricing', async ({ page }) => {
    await page.goto(MOBILE_LANDING);
    await expect(page.getByRole('button', { name: 'Open menu' })).toBeVisible();
    await page.getByRole('button', { name: 'Open menu' }).click();

    const mobileNav = page.getByRole('navigation', { name: 'Mobile navigation' });
    await expect(mobileNav).toBeVisible();
    // Scoped to the mobile nav so the assertion cannot be satisfied by the desktop nav,
    // which is in the DOM at this viewport and hidden with CSS.
    await mobileNav.getByRole('link', { name: 'Pricing' }).click();
    await expect(page).toHaveURL(/\/pricing$/);
  });

  test('routes to register from the mobile menu', async ({ page }) => {
    await page.goto(MOBILE_LANDING);
    await page.getByRole('button', { name: 'Open menu' }).click();
    await page
      .getByRole('navigation', { name: 'Mobile navigation' })
      .getByRole('link', { name: 'Register' })
      .click();
    await expect(page).toHaveURL(/\/register$/);
  });

  test('the mobile menu closes after navigating', async ({ page }) => {
    await page.goto(MOBILE_LANDING);
    await page.getByRole('button', { name: 'Open menu' }).click();
    await expect(page.getByRole('navigation', { name: 'Mobile navigation' })).toBeVisible();
    await page
      .getByRole('navigation', { name: 'Mobile navigation' })
      .getByRole('link', { name: 'Pricing' })
      .click();
    await expect(page).toHaveURL(/\/pricing$/);

    // Every mobile link calls setMenuOpen(false) on click, so the menu must not stay
    // open over the page the user just asked for.
    await expect(page.getByRole('navigation', { name: 'Mobile navigation' })).toHaveCount(0);
  });
});

const { test, expect } = require('@playwright/test');
const { markEmailVerified } = require('./helpers/verifiedUser');
const { acceptTerms } = require('./helpers/acceptTerms');

test.describe('CVBoost landing page', () => {
  test('renders hero, header and footer', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('banner')).toBeVisible();
    await expect(page.locator('h1').first()).toBeVisible();
    await expect(
      page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Pricing' })
    ).toBeVisible();
  });

  test('desktop navigation links route correctly', async ({ page }) => {
    const headerNav = page.getByRole('navigation', { name: 'Main navigation' });
    const routes = [
      { name: 'Pricing', path: '/pricing' },
      { name: 'About', path: '/about' },
      { name: 'Contact', path: '/contact' },
      { name: 'Log In', path: '/login' },
      { name: 'Register', path: '/register' },
    ];
    for (const route of routes) {
      await page.goto('/');
      await headerNav.getByRole('link', { name: route.name, exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`${route.path}$`));
    }
  });
});

test.describe('theme toggle', () => {
  test('switches between light and dark mode', async ({ page }) => {
    await page.goto('/');
    const html = page.locator('html');
    await expect(html).not.toHaveClass(/dark/);

    await page.getByRole('button', { name: 'Switch to dark mode' }).click();
    await expect(html).toHaveClass(/dark/);

    await page.getByRole('button', { name: 'Switch to light mode' }).click();
    await expect(html).not.toHaveClass(/dark/);
  });
});

test.describe('language toggle', () => {
  test('flips the header language button between EN and FR', async ({ page }) => {
    await page.goto('/');
    const langBtn = page
      .getByRole('navigation', { name: 'Main navigation' })
      .getByRole('button')
      .filter({ hasText: /^(EN|FR)$/ });
    await expect(langBtn).toBeVisible();
    const label = (await langBtn.textContent()).trim();

    await langBtn.click();
    await expect(langBtn).toHaveText(label === 'EN' ? 'FR' : 'EN');
  });
});

test.describe('API via dev proxy', () => {
  test('health endpoint returns ok through /api proxy', async ({ request }) => {
    const res = await request.get('/api/health');
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('ok');
  });
});

test.describe('registration flow', () => {
  test('registers a new user, gates them at verification, then reaches the dashboard', async ({ page }) => {
    const email = `e2e-${Date.now()}@test.com`;
    await page.goto('/register');

    await page.fill('#register-name', 'E2E Tester');
    await page.fill('#register-email', email);
    await page.fill('#register-password', 'e2e-pass-123');
    await page.fill('#register-confirm', 'e2e-pass-123');
    await acceptTerms(page);

    await page.getByRole('button', { name: 'Create Account', exact: true }).click();

    // Registration succeeds, but a brand new account is unverified, so it is sent to
    // the verification screen rather than straight to the dashboard. Asserted rather
    // than skipped over: this is the gate doing its job on the very first navigation.
    await expect(page).toHaveURL(/\/verify-email/, { timeout: 15000 });

    // No mail provider in the test environment, so the flag the gate reads is set
    // directly (see helpers/verifiedUser). A full page load re-reads /auth/me,
    // because the session cached at registration still says emailVerified: false.
    await markEmailVerified(email);
    await page.goto('/dashboard');

    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByRole('banner')).toBeVisible();
  });
});

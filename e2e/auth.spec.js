const { test, expect } = require('@playwright/test');
const { markEmailVerified } = require('./helpers/verifiedUser');

test.describe('authentication flows', () => {
  let credentials;

  test.beforeAll(async ({ request }) => {
    credentials = {
      name: 'Auth E2E',
      email: `pw-${Date.now()}@test.com`,
      password: 'pw-test-123',
    };
    const res = await request.post('/api/auth/register', { data: credentials });
    expect(res.ok()).toBeTruthy();
    // These tests are about the credential checks, not the verification gate, and
    // every route past login is gated on emailVerified. Verified up front so the
    // dashboard is reachable; see helpers/verifiedUser for why this is a write and
    // not a disabled gate.
    await markEmailVerified(credentials.email);
  });

  test('logs in with valid credentials and lands on dashboard', async ({ page }) => {
    await page.goto('/login');
    await page.fill('#login-email', credentials.email);
    await page.fill('#login-password', credentials.password);
    await page.getByRole('button', { name: 'Log In', exact: true }).click();

    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15000 });
  });

  test('shows an error and stays on login for a wrong password', async ({ page }) => {
    await page.goto('/login');
    await page.fill('#login-email', credentials.email);
    await page.fill('#login-password', 'wrong-password');
    await page.getByRole('button', { name: 'Log In', exact: true }).click();

    await expect(page.getByRole('alert')).toBeVisible({ timeout: 15000 });
    await expect(page).toHaveURL(/\/login$/);
  });
});

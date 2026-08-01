const { test, expect } = require('@playwright/test');

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

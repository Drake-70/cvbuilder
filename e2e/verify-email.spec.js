const { test, expect } = require('@playwright/test');

test.describe('email verification page', () => {
  test('shows error state for an invalid token', async ({ page }) => {
    await page.goto('/verify-email?token=not-a-real-token');
    await expect(
      page.getByRole('heading', { name: 'Verification link invalid or expired' })
    ).toBeVisible();
    await expect(page.getByRole('link', { name: 'Back to Login' })).toBeVisible();
  });

  test('shows error state when no token is present', async ({ page }) => {
    await page.goto('/verify-email');
    await expect(
      page.getByRole('heading', { name: 'Verification link invalid or expired' })
    ).toBeVisible();
  });

  test('shows the resend button for an unverified logged-in user', async ({ page }) => {
    const email = `pw-${Date.now()}@test.com`;
    const res = await page.request.post('/api/auth/register', {
      data: { name: 'Unverified User', email, password: 'pw-test-123' },
    });
    expect(res.ok()).toBeTruthy();

    await page.goto('/login');
    await page.fill('#login-email', email);
    await page.fill('#login-password', 'pw-test-123');
    await page.getByRole('button', { name: 'Log In', exact: true }).click();
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15000 });

    await page.goto('/verify-email?token=not-a-real-token');
    await expect(
      page.getByRole('heading', { name: 'Verification link invalid or expired' })
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Resend Verification Email' })
    ).toBeVisible();
  });
});

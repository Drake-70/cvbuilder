const { test, expect } = require('@playwright/test');
const { markEmailVerified } = require('./helpers/verifiedUser');
const { acceptTerms } = require('./helpers/acceptTerms');

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
    await acceptTerms(page);
    await page.getByRole('button', { name: 'Log In', exact: true }).click();
    // This is the unverified path, so it deliberately does NOT verify the user (see
    // helpers/verifiedUser). Logging in establishes a session but must not grant
    // access: the login redirect sends an unverified account to the verification
    // screen, and every gated route answers 403 EMAIL_NOT_VERIFIED behind it.
    await expect(page).toHaveURL(/\/verify-email/, { timeout: 15000 });

    await page.goto('/verify-email?token=not-a-real-token');
    await expect(
      page.getByRole('heading', { name: 'Verification link invalid or expired' })
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Resend Verification Email' })
    ).toBeVisible();
  });

  test('a verified user is sent to the dashboard, not the verification screen', async ({ page }) => {
    // The counterpart to the test above, so the redirect above cannot be "fixed" by
    // simply always sending everyone to /verify-email.
    const email = `pw-${Date.now()}@test.com`;
    const res = await page.request.post('/api/auth/register', {
      data: { name: 'Verified User', email, password: 'pw-test-123' },
    });
    expect(res.ok()).toBeTruthy();
    await markEmailVerified(email);

    await page.goto('/login');
    await page.fill('#login-email', email);
    await page.fill('#login-password', 'pw-test-123');
    await acceptTerms(page);
    await page.getByRole('button', { name: 'Log In', exact: true }).click();

    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15000 });
  });
});

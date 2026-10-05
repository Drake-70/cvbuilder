const { expect } = require('@playwright/test');

/**
 * Ticks the Terms of Service checkbox that gates both the login and register forms.
 *
 * The checkbox is required: LoginPage and RegisterPage both refuse to submit and
 * raise an "Agreement Required" toast when it is unchecked. Six specs submit these
 * forms without ticking it, so all of them were failing at the navigation
 * assertion for a reason that had nothing to do with what they claimed to test.
 *
 * One of them was worse than failing. auth.spec.js asserted that "an alert is
 * visible" after a wrong password -- and the ToS alert satisfied that, so the test
 * stayed green while never once exercising a rejected credential. A test that
 * cannot fail is not a test.
 *
 * The value is persisted in sessionStorage, but Playwright gives every test a fresh
 * browser context, so this has to run per test regardless.
 *
 * Both pages use the same accessible name, so one selector covers both.
 */
async function acceptTerms(page) {
  const checkbox = page.getByRole('checkbox', {
    name: 'I agree to the Terms of Service and Privacy Policy',
  });
  await expect(checkbox).toBeVisible();
  await checkbox.check();
}

module.exports = { acceptTerms };
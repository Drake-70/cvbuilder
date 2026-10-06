const { test, expect } = require('@playwright/test');
const { makeAdmin } = require('./helpers/adminUser');
const { acceptTerms } = require('./helpers/acceptTerms');

// Covers the admin surface, which had no e2e coverage at all until now.
//
// That gap is not a rounding error. A missing `useCallback` import in UsersTab.jsx
// shipped to master as a runtime `ReferenceError: useCallback is not defined`: the
// admin bundle built cleanly, lint passed, and all five CI jobs were green, because
// nothing in the pipeline ever asked the browser to render `/admin`. The failure
// only showed up when a human opened the page.
//
// Two guards, because neither is sufficient alone. Every tab is asserted on real
// content: React can swallow a render error into an error boundary, leaving no
// uncaught exception and an error screen instead of a dashboard, so the absence of a
// throw proves nothing on its own. `page.on('pageerror')` is the backstop that
// catches anything a content assertion happens to miss while tabbing between views.
// Reverting that one import makes this test fail on the Users tab -- verified by
// doing exactly that.
test.describe('admin dashboard', () => {
  // Registration, a Mongo round trip, a real login, and four tabs including two
  // that lazy-load their own chunks. 60s is Playwright's default and was never
  // budgeted for this.
  test.setTimeout(120_000);

  test('renders every tab without an uncaught exception', async ({ page }) => {
    const pageErrors = [];
    page.on('pageerror', (err) => pageErrors.push(String(err)));

    const email = `pw-${Date.now()}@test.com`;
    const reg = await page.request.post('/api/auth/register', {
      data: { name: 'Admin Tester', email, password: 'pw-test-123' },
    });
    expect(reg.ok()).toBeTruthy();
    await makeAdmin(email);

    await page.goto('/login');
    await page.fill('#login-email', email);
    await page.fill('#login-password', 'pw-test-123');
    await acceptTerms(page);
    await page.getByRole('button', { name: 'Log In', exact: true }).click();
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 20000 });

    // The shell itself: AdminPage is split into its own chunk and imports UsersTab
    // statically, so this line alone already fails on the exact bug described above.
    await page.goto('/admin');
    await expect(page.getByRole('heading', { name: 'Admin dashboard' })).toBeVisible({
      timeout: 20000,
    });
    await expect(page.getByRole('tablist')).toBeVisible();

    // KPIs is React.lazy and pulls in Recharts, the largest dependency in the app.
    await page.getByRole('tab', { name: 'KPIs' }).click();
    await expect(page.getByText('Activation funnel')).toBeVisible({ timeout: 30000 });

    // Health is lazy too, and is the other chart component.
    await page.getByRole('tab', { name: 'Health' }).click();
    await expect(page.getByText('Endpoint latency')).toBeVisible({ timeout: 30000 });

    // Users, then the per-user 360 panel opened from a row.
    await page.getByRole('tab', { name: 'Users' }).click();
    const search = page.getByLabel('Search users');
    await expect(search).toBeVisible({ timeout: 20000 });

    // Filtered by email rather than reaching for whatever happens to be first in
    // the list. The default page is newest-first, so this would usually work
    // without the search -- and would then break the moment the default sort or
    // the page size changed. What is under test is opening one record, not list
    // ordering, so the record is located explicitly.
    await search.fill(email);
    const row = page.getByTitle(`Open account details for ${email}`);
    await expect(row).toBeVisible({ timeout: 20000 });
    await row.click();

    await expect(
      page.getByRole('dialog', { name: `Account details for ${email}` })
    ).toBeVisible({ timeout: 20000 });

    expect(pageErrors).toEqual([]);
  });
});

const { expect } = require('@playwright/test');

// The `request` and `page` fixtures do not share a cookie jar.
//
// `request` is an APIRequestContext with its own cookie store, and `page` is a
// browser context with another. Registering or logging in through `request`
// therefore leaves the browser completely anonymous, and every protected route
// then redirects to /login.
//
// This failure mode is quiet, which is why it is worth stating plainly. A test
// that registers over the API and then asserts "some heading is visible" can
// pass against the login page's own heading, leaving the suite green while the
// page it claims to cover is never rendered once. Two of these tests did
// exactly that. Anything that authenticates through the API and then drives a
// protected page needs these two calls, in this order.
async function copyApiCookiesToBrowser(request, page) {
  const { cookies } = await request.storageState();
  await page.context().addCookies(cookies);
}

// Proves the session actually reached the browser. Without it a redirect to
// /login is silent, and the assertions that follow are measuring the login page.
async function expectInsideProtectedRoute(page, pathSuffix) {
  await expect(page).toHaveURL(new RegExp(`${pathSuffix}$`));
}

module.exports = { copyApiCookiesToBrowser, expectInsideProtectedRoute };
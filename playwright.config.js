const { defineConfig, devices } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

// Surface backend/.env keys (e.g. GROQ_API_KEY) to the test runner so gated
// tests (real-AI preview) run locally, while CI still controls them via env.
const envPath = path.join(__dirname, 'backend', '.env');
if (fs.existsSync(envPath)) {
  const pairs = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
  for (const line of pairs) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
}

module.exports = defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  timeout: 60_000,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5173',
    colorScheme: 'light',
    locale: 'en-US',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  // The backend timeout was 60s, which is not a budget anyone validated -- it is
  // Playwright's default, and it was inherited when the server was added. Measured
  // cold boot on a fresh node_modules is 52.6s before the port is even open, and a
  // CI runner always boots cold because it has just run npm ci. That left ~7s of
  // slack, so the suite failed at "Timed out waiting 60000ms from config.webServer"
  // before a single assertion ran, and produced no JSON report for the reporter to
  // surface. Warm boot is 14.2s for the same code, which is why this only ever
  // failed in CI and never on a machine that had just run the suite.
  webServer: [
    {
      command: 'node server.js',
      cwd: 'backend',
      url: 'http://localhost:5001/api/health',
      reuseExistingServer: true,
      timeout: 180000,
    },
    {
      command: 'npm run dev',
      cwd: 'frontend',
      url: 'http://localhost:5173',
      reuseExistingServer: true,
      timeout: 180000,
    },
  ],
});

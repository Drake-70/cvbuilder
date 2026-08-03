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
  webServer: [
    {
      command: 'node server.js',
      cwd: 'backend',
      url: 'http://localhost:5001/api/health',
      reuseExistingServer: true,
      timeout: 60000,
    },
    {
      command: 'npm run dev',
      cwd: 'frontend',
      url: 'http://localhost:5173',
      reuseExistingServer: true,
      timeout: 120000,
    },
  ],
});

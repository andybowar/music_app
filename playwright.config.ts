import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.PORT ?? 3000);
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${PORT}`;
// Vercel Deployment Protection: lets e2e reach protected preview deployments.
const bypassSecret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL,
    trace: 'on-first-retry',
    extraHTTPHeaders: bypassSecret
      ? { 'x-vercel-protection-bypass': bypassSecret, 'x-vercel-set-bypass-cookie': 'true' }
      : undefined,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    // REQ-NF-01: phones from 360px wide.
    { name: 'mobile', use: { ...devices['Pixel 5'], viewport: { width: 360, height: 780 } } },
  ],
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: process.env.CI
          ? `pnpm exec next start --port ${PORT}`
          : `pnpm exec next dev --turbopack --port ${PORT}`,
        // `/` redirects to a route that 404s until SRCH-09 lands, so wait on the port.
        port: PORT,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});

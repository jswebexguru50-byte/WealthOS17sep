/**
 * Playwright Configuration — WealthOS E2E & Visual Regression Tests
 */
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  // `pipeline.test.ts` is a Vitest integration suite and is run by
  // `npx vitest run tests/e2e/pipeline.test.ts`, not by Playwright.
  testMatch: '**/*.spec.ts',
  outputDir: 'tests/reports/playwright',

  // Run tests in files in parallel
  fullyParallel: false, // Sequential for consistency with shared server state

  // Retry on CI
  retries: process.env.CI ? 1 : 0,

  // Reporter
  reporter: [
    ['list'],
    ['html', { outputFolder: 'tests/reports/playwright-html', open: 'never' }],
    ['json', { outputFile: 'tests/reports/playwright-results.json' }],
  ],

  // Shared settings for all tests
  use: {
    baseURL: 'http://localhost:3000',
    headless: true,  // Set to false for visual debugging
    viewport: { width: 1920, height: 1080 },
    screenshot: 'only-on-failure',
    video: 'off',
    trace: 'off',
    actionTimeout: 10_000,
    navigationTimeout: 30_000,

    // Ignore HTTPS errors (self-signed certs)
    ignoreHTTPSErrors: true,
  },

  // Test projects — use Playwright-managed browsers; no system Chrome/Edge required.
  projects: [
    {
      name: 'chromium-desktop',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1920, height: 1080 },
      },
    },
    {
      name: 'edge-desktop',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1920, height: 1080 },
      },
    },
  ],

  // Global timeout per test
  timeout: 60_000,

  // Pre-run: verify server is alive
  webServer: {
    command: 'node dist/server.cjs',
    url: 'http://localhost:3000/api/healthcheck',
    reuseExistingServer: true, // Don't restart if already running
    timeout: 30_000,
  },

  // Expect visual comparison threshold
  expect: {
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.02, // Allow 2% pixel difference
    },
    timeout: 10_000,
  },
});

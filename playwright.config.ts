import { existsSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

if (existsSync('.env')) process.loadEnvFile('.env');

const PORT = process.env['PORT'] ?? '3210';
const BASE_URL = process.env['BASE_URL'] ?? `http://localhost:${PORT}`;
const CI = !!process.env['CI'];

/** API tests need no browser; accessibility scans run once, on Chromium. */
const API_TESTS = /tests[\\/]api[\\/]/;
const A11Y_TESTS = /tests[\\/]accessibility[\\/]/;

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: CI,
  retries: CI ? 2 : 0,
  workers: CI ? 2 : undefined,
  timeout: 30_000,
  expect: { timeout: 7_000 },
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ...(CI ? ([['github'], ['blob']] as const) : []),
  ],
  use: {
    baseURL: BASE_URL,
    testIdAttribute: 'data-testid',
    trace: CI ? 'on-first-retry' : 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 10_000,
    navigationTimeout: 20_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      testIgnore: API_TESTS,
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
      testIgnore: [API_TESTS, A11Y_TESTS],
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
      testIgnore: [API_TESTS, A11Y_TESTS],
    },
    {
      name: 'mobile-chrome',
      use: { ...devices['Pixel 7'] },
      testIgnore: [API_TESTS, A11Y_TESTS],
    },
    {
      name: 'api',
      testMatch: API_TESTS,
    },
  ],
  webServer: {
    command: 'npx tsx app/server.ts',
    url: `${BASE_URL}/api/health`,
    reuseExistingServer: !CI,
    timeout: 60_000,
    stdout: 'ignore',
    stderr: 'pipe',
    env: { PORT },
  },
});

import { defineConfig } from '@playwright/test';

const port = process.env.TEST_PORT || '42871';
export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.js',
  workers: 1,
  fullyParallel: false,
  timeout: 60000,
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    channel: 'msedge',
    viewport: { width: 390, height: 844 },
    acceptDownloads: true,
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `"${process.execPath}" scripts/serve.js dist`,
    url: `http://127.0.0.1:${port}`,
    env: { PORT: port },
    reuseExistingServer: false,
  },
});

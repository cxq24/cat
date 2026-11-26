import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser',
  workers: 2,
  reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:4174', viewport: { width: 390, height: 844 }, launchOptions: { executablePath: '/usr/bin/chromium', args: ['--no-sandbox'] }, screenshot: 'only-on-failure' },
  webServer: { command: 'PORT=4174 node scripts/serve.mjs --production', url: 'http://127.0.0.1:4174', reuseExistingServer: false, timeout: 30000 }
});

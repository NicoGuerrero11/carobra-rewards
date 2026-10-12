import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e', testMatch: 'gift-card-access.spec.ts', timeout: 30000,
  reporter: [['list']], use: { baseURL: 'http://127.0.0.1:4326', trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'], channel: 'chromium' } },
    { name: 'mobile-chromium', use: { ...devices['Pixel 5'], channel: 'chromium' } },
  ],
  webServer: [
    { command: 'node tests/support/mock-site-backend.mjs', url: 'http://127.0.0.1:3006/__health', reuseExistingServer: false, env: { MOCK_SITE_BACKEND_PORT: '3006' } },
    { command: 'node node_modules/astro/bin/astro.mjs dev --ignore-lock --host 127.0.0.1 --port 4326', url: 'http://127.0.0.1:4326/login', reuseExistingServer: false, env: { SITE_BACKEND_BASE_URL: 'http://127.0.0.1:3006' } },
  ],
});

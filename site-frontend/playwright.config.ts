import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: false,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://127.0.0.1:4322",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "desktop-chromium",
      use: { ...devices["Desktop Chrome"], channel: "chromium" },
    },
    {
      name: "mobile-chromium",
      use: { ...devices["Pixel 5"], channel: "chromium" },
    },
  ],
  webServer: [
    {
      command: "node tests/support/mock-site-backend.mjs",
      url: "http://127.0.0.1:3002/__health",
      timeout: 30_000,
      reuseExistingServer: false,
    },
    {
      command: "npm run dev -- --host 127.0.0.1 --port 4322",
      url: "http://127.0.0.1:4322/login",
      timeout: 120_000,
      reuseExistingServer: false,
      env: {
        SITE_BACKEND_BASE_URL: "http://127.0.0.1:3002",
      },
    },
  ],
});

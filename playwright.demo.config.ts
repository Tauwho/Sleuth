import { defineConfig, devices } from "@playwright/test";

/**
 * Demo mode (ADR 0010) on its own server, so it never shares state with the fixture-mode specs.
 * Run: pnpm test:e2e:demo
 */
export default defineConfig({
  testDir: "./tests/e2e-demo",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: { baseURL: "http://localhost:3100", trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "pnpm --filter @sleuth/web exec next dev --port 3100",
    url: "http://localhost:3100",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: { SLEUTH_DATA_MODE: "demo" },
  },
});

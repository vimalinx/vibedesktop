import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e", fullyParallel: false, workers: 1, timeout: 45_000,
  expect: { timeout: 12_000 },
  use: { baseURL: "http://127.0.0.1:3110", viewport: { width: 1440, height: 1000 },
    trace: "retain-on-failure", screenshot: "only-on-failure",
    launchOptions: { executablePath: process.env.VIBE_TEST_CHROMIUM || undefined, args: ["--disable-gpu"] } },
  webServer: { command: "node scripts/e2e-server.mjs", url: "http://127.0.0.1:3110/api/health", reuseExistingServer: false, gracefulShutdown: { signal: "SIGTERM", timeout: 5000 }, timeout: 120_000 },
});

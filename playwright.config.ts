// ============================================================
// playwright.config.ts
// Playwright E2E test configuration for NextAgentAI.
// Tests live in e2e/tests/; fixtures and helpers in e2e/fixtures/
// and e2e/helpers/ respectively.
//
// Base URLs are configurable via environment variables:
//   PLAYWRIGHT_BASE_URL  — frontend (default: http://localhost:3005)
//   PLAYWRIGHT_API_URL   — backend  (default: http://localhost:8000)
// ============================================================

import { defineConfig, devices } from "@playwright/test";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3005";

export default defineConfig({
  // ---------------------------------------------------------------------------
  // Test discovery
  // ---------------------------------------------------------------------------
  testDir: "./e2e/tests",
  testMatch: "**/*.spec.ts",

  // ---------------------------------------------------------------------------
  // Timeouts
  // Agent queries can take 10-30s for hybrid runs (even mocked ones need breathing room)
  // ---------------------------------------------------------------------------
  timeout: 60_000,          // Per-test timeout
  expect: {
    timeout: 10_000,        // Per-assertion timeout
  },

  // ---------------------------------------------------------------------------
  // Parallelism — safe default for mocked tests; lower if hitting race conditions
  // ---------------------------------------------------------------------------
  fullyParallel: true,

  // ---------------------------------------------------------------------------
  // Retries — 2 on CI, 0 locally
  // ---------------------------------------------------------------------------
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,

  // ---------------------------------------------------------------------------
  // Reporters
  // ---------------------------------------------------------------------------
  reporter: [
    ["html", { outputFolder: "playwright-report", open: "never" }],
    ["list"],
    ...(process.env.CI
      ? [["github"] as ["github"]]
      : []),
  ],

  // ---------------------------------------------------------------------------
  // Global test settings
  // ---------------------------------------------------------------------------
  use: {
    baseURL: BASE_URL,

    // Capture screenshots on test failure
    screenshot: "only-on-failure",

    // Record video on retry (helps debug flaky tests)
    video: "on-first-retry",

    // Full trace on retry (Playwright's trace viewer — see E2E_TESTS.md)
    trace: "on-first-retry",

    // Navigation timeout (covers slow cold starts on Render free tier)
    navigationTimeout: 30_000,

    // Action timeout (covers slow React hydration on first load)
    actionTimeout: 15_000,
  },

  // ---------------------------------------------------------------------------
  // Browser projects
  // ---------------------------------------------------------------------------
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        // Viewport that fits the four-panel grid comfortably
        viewport: { width: 1440, height: 900 },
      },
    },
    {
      name: "firefox",
      use: {
        ...devices["Desktop Firefox"],
        viewport: { width: 1440, height: 900 },
      },
    },
    {
      name: "webkit",
      use: {
        ...devices["Desktop Safari"],
        viewport: { width: 1440, height: 900 },
      },
    },
  ],

  // ---------------------------------------------------------------------------
  // Local dev server — starts the Next.js dev server before tests run.
  // Comment this out if you prefer to start the server manually.
  // Set SKIP_WEBSERVER=true in CI if the server is already running.
  // ---------------------------------------------------------------------------
  webServer: process.env.SKIP_WEBSERVER
    ? undefined
    : {
        command: "npm run dev",
        cwd: "./frontend",
        url: BASE_URL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        stdout: "pipe",
        stderr: "pipe",
        env: {
          // Point the frontend at the mocked/live API URL
          NEXT_PUBLIC_API_URL: process.env.PLAYWRIGHT_API_URL ?? "http://localhost:8000",
        },
      },
});

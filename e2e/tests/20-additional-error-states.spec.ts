// ============================================================
// 20-additional-error-states.spec.ts
// Error states not covered in 07-error-states.spec.ts:
//   - Cold-start: backend unreachable at page load
//   - CORS fix: GET /healthz doesn't send Content-Type
//   - Empty query validation on all pages
//   - Medical disclaimer absent in aircraft mode
// ============================================================

import { test, expect } from "@playwright/test";
import { mockHealthOk } from "../fixtures/api-mock";

const API_URL = process.env.PLAYWRIGHT_API_URL ?? "http://localhost:8000";

test.describe("Error states — cold start / backend unreachable", () => {
  test("chat input is available even when backend is completely unreachable", async ({ page }) => {
    // Abort all backend requests (simulates totally unreachable backend)
    await page.route(`${API_URL}/**`, (route) => route.abort("connectionrefused"));

    await page.goto("/");
    await page.getByRole("button", { name: /AIRCRAFT/i }).waitFor({ state: "visible" });

    // The textarea must still be visible and enabled
    const textarea = page.locator("textarea").first();
    await expect(textarea).toBeVisible({ timeout: 5_000 });
    await expect(textarea).toBeEnabled();
  });

  test("BACKEND WARMING UP banner shown when all healthz calls fail", async ({ page }) => {
    await page.route(`${API_URL}/healthz`, (route) => route.abort("connectionrefused"));
    await page.goto("/");

    // After first failed ping, the cold banner should appear
    await expect(page.getByText(/BACKEND WARMING UP/i)).toBeVisible({ timeout: 15_000 });
  });

  test("all three panels still render when backend is unreachable", async ({ page }) => {
    await page.route(`${API_URL}/**`, (route) => route.abort("connectionrefused"));
    await page.goto("/");
    await page.getByRole("button", { name: /AIRCRAFT/i }).waitFor({ state: "visible" });

    // Three panel header labels should be present
    await expect(page.getByText(/COMMS.*QUERY INTERFACE|QUERY INTERFACE/i).first()).toBeVisible();
    await expect(page.getByText(/AGENT EXECUTION TRACE/i)).toBeVisible();
    await expect(page.getByText(/KNOWLEDGE GRAPH/i).first()).toBeVisible();
  });
});

test.describe("Error states — CORS preflight fix verification", () => {
  test("GET /healthz request does not include Content-Type header", async ({ page }) => {
    let healthzHeaders: Record<string, string> = {};

    await page.route(`${API_URL}/healthz`, async (route) => {
      // Capture the outgoing request headers
      healthzHeaders = route.request().headers();
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ status: "ok", db: true, version: "1.0.0" }),
      });
    });

    await page.goto("/");
    await page.getByRole("button", { name: /AIRCRAFT/i }).waitFor({ state: "visible" });
    // Allow the healthz ping to fire
    await page.waitForTimeout(500);

    // Per the CORS fix in api.ts: GET requests must NOT send Content-Type
    // (adding Content-Type to a GET turns it from a "simple" CORS request
    //  into a preflight request, which fails during Render cold starts)
    expect(healthzHeaders["content-type"]).toBeUndefined();
  });
});

test.describe("Error states — query submission guards", () => {
  test.beforeEach(async ({ page }) => {
    await mockHealthOk(page);
    await page.goto("/");
    await page.getByRole("button", { name: /AIRCRAFT/i }).waitFor({ state: "visible" });
  });

  test("whitespace-only query does not fire POST /query", async ({ page }) => {
    let fired = false;
    await page.route(`${API_URL}/query`, async (route) => {
      fired = true;
      await route.abort();
    });

    const textarea = page.locator("textarea").first();
    await textarea.fill("     ");
    // Submit button should be disabled
    await expect(page.getByRole("button", { name: /Submit query/i })).toBeDisabled();
    await page.waitForTimeout(200);
    expect(fired).toBe(false);
  });

  test("submit button disabled during in-flight request prevents double-submit", async ({ page }) => {
    let requestCount = 0;
    await page.route(`${API_URL}/query`, async (route) => {
      requestCount++;
      // Hold the first request
      await new Promise((r) => setTimeout(r, 1_000));
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ run_id: "x", query: "q", answer: "a", claims: [], evidence: { vector_hits: [], sql_rows: [] }, graph_path: { nodes: [], edges: [] }, run_summary: { intent: "vector_only", plan_text: "", steps: [], tools_used: [], total_latency_ms: 0, halted_at_step_limit: false }, assumptions: [], next_steps: [] }),
      });
    });

    const textarea = page.locator("textarea").first();
    await textarea.fill("Find similar incidents");
    const submitBtn = page.getByRole("button", { name: /Submit query/i });
    await submitBtn.click();

    // Button should be disabled immediately
    await expect(submitBtn).toBeDisabled({ timeout: 1_000 });
    // Attempt to click again while in-flight — should be a no-op
    await submitBtn.click({ force: true }).catch(() => {});

    // Wait for the response to arrive
    await page.waitForTimeout(1_500);
    // Only one request should have been sent
    expect(requestCount).toBe(1);
  });
});

test.describe("Error states — medical disclaimer visibility", () => {
  test.beforeEach(async ({ page }) => {
    await mockHealthOk(page);
  });

  test("medical disclaimer is NOT shown in aircraft domain", async ({ page }) => {
    await page.evaluate(() => localStorage.setItem("nextai_domain", "aircraft"));
    await page.goto("/");
    await page.getByRole("button", { name: /AIRCRAFT/i }).waitFor({ state: "visible" });

    // The disclaimer from DOMAIN_CONFIGS.aircraft is null — should not appear
    await expect(
      page.getByText(/AI-generated analysis for research purposes only/i)
    ).toBeHidden({ timeout: 5_000 });
  });

  test("medical disclaimer IS shown in medical domain", async ({ page }) => {
    await page.evaluate(() => localStorage.setItem("nextai_domain", "medical"));
    await page.goto("/");
    await page.getByRole("button", { name: /AIRCRAFT/i }).waitFor({ state: "visible" });

    await expect(
      page.getByText(/AI-generated analysis for research purposes only/i)
    ).toBeVisible({ timeout: 5_000 });
  });

  test("medical disclaimer includes 'Not clinical advice' text", async ({ page }) => {
    await page.evaluate(() => localStorage.setItem("nextai_domain", "medical"));
    await page.goto("/");
    await page.getByRole("button", { name: /AIRCRAFT/i }).waitFor({ state: "visible" });

    await expect(page.getByText(/Not clinical advice/i)).toBeVisible({ timeout: 5_000 });
  });

  test("medical disclaimer is visible in empty-state chat area", async ({ page }) => {
    await page.evaluate(() => localStorage.setItem("nextai_domain", "medical"));
    await page.goto("/");
    await page.getByRole("button", { name: /AIRCRAFT/i }).waitFor({ state: "visible" });

    // The disclaimer renders inside the ChatPanel empty state
    // (when messages.length === 0 and config.disclaimer is set)
    await expect(
      page.getByText(/AI-generated analysis/i)
    ).toBeVisible({ timeout: 5_000 });
  });
});

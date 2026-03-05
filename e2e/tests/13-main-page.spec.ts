// ============================================================
// 13-main-page.spec.ts
// Main page (/) smoke tests rewritten against actual markup.
//
// The existing 01-layout.spec.ts uses incorrect selectors
// (looks for role="heading" nodes that don't exist in the SCADA
// panel design). These tests use actual text/class selectors.
//
// Coverage:
//   - App title "NEXTAGENTAI" visible in the header
//   - Chat panel renders with correct placeholder for current domain
//   - Submit button is disabled when textarea is empty
//   - Submit button is disabled while a request is in flight
//   - Empty query: Enter key does not fire a request
//   - GraphViewer: .react-flow container is visible
//   - GraphViewer: zoom controls (react-flow__controls) visible
//   - AgentTimeline: "AWAITING" or empty state text visible
//   - Backend warm-up: healthz is called on page load
//   - Theme toggle: clicking switches dark/light class on <html>
//   - Status dots (VECTOR / SQL / GRAPH) are visible in header
// ============================================================

import { test, expect } from "@playwright/test";
import { NavPage } from "../helpers/nav-page";
import { mockHealthOk, mockQueryResponse, MOCK_RESPONSE_QUERY_1 } from "../fixtures/api-mock";

const API_URL = process.env.PLAYWRIGHT_API_URL ?? "http://localhost:8000";

test.describe("Main page — header and structure", () => {
  test.beforeEach(async ({ page }) => {
    await mockHealthOk(page);
    await page.goto("/");
    // Wait for React hydration — the domain switcher buttons confirm client code ran
    await page.getByRole("button", { name: /AIRCRAFT/i }).waitFor({ state: "visible" });
  });

  test("page title contains 'NextAgentAI'", async ({ page }) => {
    await expect(page).toHaveTitle(/NextAgentAI/i);
  });

  test("brand name NEXTAGENTAI is visible in the header", async ({ page }) => {
    // The header renders: NEXT + AGENT (green) + AI as separate spans
    await expect(page.getByText(/NEXTAGENTAI|NEXT.*AGENT.*AI/i).first()).toBeVisible();
  });

  test("VECTOR status dot label is visible in the header", async ({ page }) => {
    await expect(page.getByText("VECTOR")).toBeVisible();
  });

  test("SQL status dot label is visible in the header", async ({ page }) => {
    await expect(page.getByText("SQL")).toBeVisible();
  });

  test("GRAPH status dot label is visible in the header", async ({ page }) => {
    await expect(page.getByText("GRAPH")).toBeVisible();
  });

  test("NAVIGATE dropdown trigger is visible in the header", async ({ page }) => {
    await expect(page.getByRole("button", { name: /NAVIGATE/i })).toBeVisible();
  });

  test("AIRCRAFT domain button is visible in the header", async ({ page }) => {
    await expect(page.getByRole("button", { name: /AIRCRAFT/i })).toBeVisible();
  });

  test("MEDICAL domain button is visible in the header", async ({ page }) => {
    await expect(page.getByRole("button", { name: /MEDICAL/i })).toBeVisible();
  });

  test("theme toggle button is visible in the header", async ({ page }) => {
    await expect(page.getByTitle(/Switch to (light|dark) mode/i)).toBeVisible();
  });

  test("lang attribute on html is 'en'", async ({ page }) => {
    const lang = await page.locator("html").getAttribute("lang");
    expect(lang).toBe("en");
  });
});

test.describe("Main page — Chat panel", () => {
  test.beforeEach(async ({ page }) => {
    await mockHealthOk(page);
    await page.goto("/");
    await page.getByRole("button", { name: /AIRCRAFT/i }).waitFor({ state: "visible" });
  });

  test("COMMS // QUERY INTERFACE panel header is visible", async ({ page }) => {
    await expect(page.getByText(/COMMS.*QUERY INTERFACE|QUERY INTERFACE/i).first()).toBeVisible();
  });

  test("chat textarea is visible and enabled", async ({ page }) => {
    const textarea = page.locator("textarea").first();
    await expect(textarea).toBeVisible();
    await expect(textarea).toBeEnabled();
  });

  test("textarea has aircraft domain placeholder text by default", async ({ page }) => {
    const textarea = page.locator("textarea").first();
    const placeholder = await textarea.getAttribute("placeholder") ?? "";
    expect(placeholder.toLowerCase()).toContain("maintenance");
  });

  test("submit button is visible", async ({ page }) => {
    await expect(page.getByRole("button", { name: /Submit query/i })).toBeVisible();
  });

  test("submit button is disabled when textarea is empty", async ({ page }) => {
    const btn = page.getByRole("button", { name: /Submit query/i });
    await expect(btn).toBeDisabled();
  });

  test("submit button becomes enabled when text is typed", async ({ page }) => {
    const textarea = page.locator("textarea").first();
    await textarea.fill("Find similar incidents");
    const btn = page.getByRole("button", { name: /Submit query/i });
    await expect(btn).toBeEnabled();
  });

  test("submit button re-disables when textarea is cleared", async ({ page }) => {
    const textarea = page.locator("textarea").first();
    await textarea.fill("some text");
    await textarea.fill("");
    const btn = page.getByRole("button", { name: /Submit query/i });
    await expect(btn).toBeDisabled();
  });

  test("AWAITING QUERY INPUT empty-state text is visible", async ({ page }) => {
    await expect(page.getByText(/AWAITING QUERY INPUT/i)).toBeVisible();
  });

  test("pressing Enter on empty textarea does not fire a POST /query", async ({ page }) => {
    let requestFired = false;
    await page.route(`${API_URL}/query`, async (route) => {
      requestFired = true;
      await route.abort();
    });
    const textarea = page.locator("textarea").first();
    await textarea.press("Enter");
    // Allow event loop to process
    await page.waitForTimeout(200);
    expect(requestFired).toBe(false);
  });

  test("pressing Shift+Enter in textarea inserts a newline (does not submit)", async ({ page }) => {
    await mockQueryResponse(page, MOCK_RESPONSE_QUERY_1);
    const textarea = page.locator("textarea").first();
    await textarea.fill("line one");
    await textarea.press("Shift+Enter");
    // After Shift+Enter, value should contain a newline
    const value = await textarea.inputValue();
    expect(value).toContain("\n");
  });

  test("submitting a query disables the textarea during loading", async ({ page }) => {
    // Use a slow mock so we can observe the disabled state
    await page.route(`${API_URL}/query`, async (route) => {
      // Hold the response for 500ms
      await new Promise((r) => setTimeout(r, 500));
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_RESPONSE_QUERY_1),
      });
    });

    const textarea = page.locator("textarea").first();
    await textarea.fill("Find similar incidents");
    await page.getByRole("button", { name: /Submit query/i }).click();

    // Textarea should become disabled while loading
    await expect(textarea).toBeDisabled({ timeout: 2_000 });
  });

  test("submitting a query clears the textarea input", async ({ page }) => {
    await mockQueryResponse(page, MOCK_RESPONSE_QUERY_1);
    const textarea = page.locator("textarea").first();
    await textarea.fill("Find similar incidents");
    await page.getByRole("button", { name: /Submit query/i }).click();
    // After submit, input is cleared (from the handleSubmit implementation)
    await expect(textarea).toHaveValue("", { timeout: 5_000 });
  });

  test("user message bubble appears after submitting a query", async ({ page }) => {
    await mockQueryResponse(page, MOCK_RESPONSE_QUERY_1);
    const textarea = page.locator("textarea").first();
    await textarea.fill("Find similar incidents");
    await page.getByRole("button", { name: /Submit query/i }).click();

    // User message rendered with "OPERATOR >" label
    await expect(page.getByText("OPERATOR >")).toBeVisible({ timeout: 10_000 });
  });

  test("assistant response bubble appears after a successful query", async ({ page }) => {
    await mockQueryResponse(page, MOCK_RESPONSE_QUERY_1);
    const textarea = page.locator("textarea").first();
    await textarea.fill("Find similar incidents");
    await page.getByRole("button", { name: /Submit query/i }).click();

    // Assistant response has "NEXTAGENT RESPONSE" label
    await expect(page.getByText("NEXTAGENT RESPONSE")).toBeVisible({ timeout: 15_000 });
  });
});

test.describe("Main page — backend warm-up ping", () => {
  test("GET /healthz is called on page load", async ({ page }) => {
    let healthzCalled = false;
    await page.route(`${API_URL}/healthz`, async (route) => {
      healthzCalled = true;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ status: "ok", db: true, version: "1.0.0" }),
      });
    });

    await page.goto("/");
    await page.getByRole("button", { name: /AIRCRAFT/i }).waitFor({ state: "visible" });
    // Allow time for the useEffect to fire
    await page.waitForTimeout(500);
    expect(healthzCalled).toBe(true);
  });

  test("warm-up status shows 'CONNECTING TO BACKEND' while healthz is pending", async ({ page }) => {
    // Mock a slow healthz to hold it in the "checking" state
    await page.route(`${API_URL}/healthz`, async (route) => {
      await new Promise((r) => setTimeout(r, 2_000));
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ status: "ok", db: true, version: "1.0.0" }),
      });
    });

    await page.goto("/");
    // Status banner should appear immediately
    await expect(page.getByText(/CONNECTING TO BACKEND/i)).toBeVisible({ timeout: 5_000 });
  });

  test("warm-up banner disappears after healthz resolves ok", async ({ page }) => {
    await mockHealthOk(page);
    await page.goto("/");
    // Banner should disappear once health ping resolves
    await expect(page.getByText(/CONNECTING TO BACKEND/i)).toBeHidden({ timeout: 10_000 });
  });

  test("warm-up banner shows BACKEND WARMING UP when healthz fails", async ({ page }) => {
    // Abort the healthz request to simulate a cold-start failure
    await page.route(`${API_URL}/healthz`, (route) => route.abort("connectionrefused"));
    await page.goto("/");
    await expect(page.getByText(/BACKEND WARMING UP/i)).toBeVisible({ timeout: 10_000 });
  });
});

test.describe("Main page — GraphViewer panel", () => {
  test.beforeEach(async ({ page }) => {
    await mockHealthOk(page);
    await page.goto("/");
    await page.getByRole("button", { name: /AIRCRAFT/i }).waitFor({ state: "visible" });
  });

  test("KNOWLEDGE GRAPH panel header is visible", async ({ page }) => {
    await expect(page.getByText(/KNOWLEDGE GRAPH/i).first()).toBeVisible();
  });

  test(".react-flow container is present and visible", async ({ page }) => {
    await expect(page.locator(".react-flow")).toBeVisible();
  });

  test("React Flow zoom controls are visible", async ({ page }) => {
    await expect(page.locator(".react-flow__controls")).toBeVisible();
  });

  test("React Flow background (grid) is present", async ({ page }) => {
    await expect(page.locator(".react-flow__background")).toBeVisible();
  });

  test("static mock graph shows at least one node before any query", async ({ page }) => {
    // GraphViewer shows a static mock graph on load
    await page.locator(".react-flow__node").first().waitFor({ state: "visible", timeout: 10_000 });
    const nodeCount = await page.locator(".react-flow__node").count();
    expect(nodeCount).toBeGreaterThan(0);
  });

  test("medical domain changes the graph panel label to CLINICAL KNOWLEDGE GRAPH", async ({ page }) => {
    const nav = new NavPage(page);
    await nav.setDomain("medical");
    await expect(page.getByText(/CLINICAL KNOWLEDGE GRAPH/i)).toBeVisible({ timeout: 5_000 });
  });
});

test.describe("Main page — AgentTimeline panel", () => {
  test.beforeEach(async ({ page }) => {
    await mockHealthOk(page);
    await page.goto("/");
    await page.getByRole("button", { name: /AIRCRAFT/i }).waitFor({ state: "visible" });
  });

  test("AGENT EXECUTION TRACE panel header is visible", async ({ page }) => {
    await expect(page.getByText(/AGENT EXECUTION TRACE/i)).toBeVisible();
  });

  test("timeline shows empty-state message before first query", async ({ page }) => {
    // AgentTimeline shows "AWAITING FIRST QUERY" or similar empty state
    // when runData is null (no queries submitted yet)
    await expect(
      page.getByText(/AWAITING|NO.*RUN|NO RUN|SUBMIT.*QUERY|QUERY.*TO SEE/i).first()
    ).toBeVisible({ timeout: 5_000 });
  });

  test("timeline shows run data after a successful query", async ({ page }) => {
    await mockQueryResponse(page, MOCK_RESPONSE_QUERY_1);
    const textarea = page.locator("textarea").first();
    await textarea.fill("Find similar incidents");
    await page.getByRole("button", { name: /Submit query/i }).click();

    // Wait for the assistant response first
    await page.getByText("NEXTAGENT RESPONSE").waitFor({ state: "visible", timeout: 15_000 });

    // Timeline should now show tool execution steps from run_summary.steps
    // The mock response has steps with tool names like VectorSearchTool
    await expect(page.getByText(/VectorSearchTool|vector.*search|sql.*query/i).first()).toBeVisible({
      timeout: 10_000,
    });
  });
});

test.describe("Main page — theme toggle", () => {
  test.beforeEach(async ({ page }) => {
    await mockHealthOk(page);
    // Start in known dark mode
    await page.evaluate(() => {
      localStorage.setItem("theme", "dark");
      document.documentElement.classList.remove("light");
      document.documentElement.classList.add("dark");
    });
    await page.goto("/");
    await page.getByRole("button", { name: /AIRCRAFT/i }).waitFor({ state: "visible" });
  });

  test("theme toggle button shows 'LIGHT' when in dark mode", async ({ page }) => {
    // In dark mode, the button shows "LIGHT" (the action to take)
    await expect(page.getByTitle("Switch to light mode")).toBeVisible();
  });

  test("clicking theme toggle in dark mode adds 'light' class to html", async ({ page }) => {
    await page.getByTitle("Switch to light mode").click();
    const cls = await page.locator("html").getAttribute("class") ?? "";
    expect(cls).toContain("light");
  });

  test("clicking theme toggle twice returns to dark mode", async ({ page }) => {
    await page.getByTitle("Switch to light mode").click();
    await page.getByTitle("Switch to dark mode").click();
    const cls = await page.locator("html").getAttribute("class") ?? "";
    expect(cls).toContain("dark");
  });

  test("theme toggle updates localStorage 'theme' key", async ({ page }) => {
    await page.getByTitle("Switch to light mode").click();
    const stored = await page.evaluate(() => localStorage.getItem("theme"));
    expect(stored).toBe("light");
  });

  test("theme persists after reload", async ({ page }) => {
    await page.getByTitle("Switch to light mode").click();
    await page.reload();
    await page.getByRole("button", { name: /AIRCRAFT/i }).waitFor({ state: "visible" });
    const cls = await page.locator("html").getAttribute("class") ?? "";
    expect(cls).toContain("light");
  });
});

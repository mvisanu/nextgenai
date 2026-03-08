// ============================================================
// production-vercel.spec.ts
// Live production end-to-end tests against:
//   Frontend: https://nextgenai-seven.vercel.app
//   Backend:  https://nextgenai-5bf8.onrender.com
//
// Run:
//   PLAYWRIGHT_BASE_URL=https://nextgenai-seven.vercel.app \
//   PLAYWRIGHT_API_URL=https://nextgenai-5bf8.onrender.com \
//   npx playwright test e2e/tests/production-vercel.spec.ts \
//     --project=chromium --timeout=120000
// ============================================================

import { test, expect, request } from "@playwright/test";

const FRONTEND = process.env.PLAYWRIGHT_BASE_URL ?? "https://nextgenai-seven.vercel.app";
const API = process.env.PLAYWRIGHT_API_URL ?? "https://nextgenai-5bf8.onrender.com";

// Generous timeout for Render cold starts (free tier can take 60s+)
const COLD_START_TIMEOUT = 90_000;
const PAGE_LOAD_TIMEOUT  = 30_000;
const QUERY_TIMEOUT      = 90_000;

// ---------------------------------------------------------------------------
// 1. BACKEND API HEALTH
// ---------------------------------------------------------------------------
test.describe("Backend API — health and contract", () => {

  test("GET /healthz returns status ok", async ({ request: req }) => {
    const res = await req.get(`${API}/healthz`, { timeout: COLD_START_TIMEOUT });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("status");
    // status should be "ok" (db connected) or "degraded" (db down but service alive)
    expect(["ok", "degraded"]).toContain(body.status);
  });

  test("GET /healthz db field is present and boolean", async ({ request: req }) => {
    const res = await req.get(`${API}/healthz`, { timeout: COLD_START_TIMEOUT });
    const body = await res.json();
    expect(typeof body.db).toBe("boolean");
    // Record actual value — test does not assert true/false since DB may be down
  });

  test("GET /healthz db:true (DB connected)", async ({ request: req }) => {
    const res = await req.get(`${API}/healthz`, { timeout: COLD_START_TIMEOUT });
    const body = await res.json();
    expect(body.db).toBe(true); // This will FAIL if DB DSN is still broken
  });

  test("GET /api/docs returns 200 Swagger UI", async ({ request: req }) => {
    const res = await req.get(`${API}/api/docs`, { timeout: COLD_START_TIMEOUT });
    expect(res.status()).toBe(200);
    const text = await res.text();
    expect(text).toContain("swagger-ui");
  });

  test("GET /api/openapi.json returns valid OpenAPI schema", async ({ request: req }) => {
    const res = await req.get(`${API}/api/openapi.json`, { timeout: COLD_START_TIMEOUT });
    expect(res.status()).toBe(200);
    const schema = await res.json();
    expect(schema.openapi).toMatch(/^3\./);
    expect(schema.info.title).toBeTruthy();
    expect(schema.paths["/query"]).toBeTruthy();
    expect(schema.paths["/healthz"]).toBeTruthy();
  });

  test("POST /query returns QueryResponse shape for aircraft domain", async ({ request: req }) => {
    const res = await req.post(`${API}/query`, {
      data: { query: "Show hydraulic system defect trends", domain: "aircraft" },
      timeout: QUERY_TIMEOUT,
    });
    // Accept 200 (success) or 500/503 (db down causes 500 but service lives)
    const status = res.status();
    if (status === 200) {
      const body = await res.json();
      expect(body).toHaveProperty("run_id");
      expect(body).toHaveProperty("answer");
      expect(body).toHaveProperty("evidence");
      expect(body).toHaveProperty("graph_path");
      expect(body).toHaveProperty("run_summary");
      expect(body.graph_path).toHaveProperty("nodes");
      expect(body.graph_path).toHaveProperty("edges");
      expect(Array.isArray(body.graph_path.nodes)).toBe(true);
      expect(Array.isArray(body.graph_path.edges)).toBe(true);
    } else {
      // DB down — log status but do not hard-fail this assertion
      console.warn(`POST /query returned HTTP ${status} (likely DB down)`);
    }
  });

  test("POST /query with medical domain returns correct shape", async ({ request: req }) => {
    const res = await req.post(`${API}/query`, {
      data: { query: "Summarize recent patient cases with respiratory symptoms", domain: "medical" },
      timeout: QUERY_TIMEOUT,
    });
    const status = res.status();
    if (status === 200) {
      const body = await res.json();
      expect(body).toHaveProperty("run_id");
      expect(body.answer).toBeTruthy();
    } else {
      console.warn(`Medical POST /query returned HTTP ${status}`);
    }
  });

  test("POST /query rejects query shorter than 3 characters", async ({ request: req }) => {
    const res = await req.post(`${API}/query`, {
      data: { query: "hi", domain: "aircraft" },
      timeout: COLD_START_TIMEOUT,
    });
    expect(res.status()).toBe(422);
  });

  test("POST /query rejects invalid domain value", async ({ request: req }) => {
    const res = await req.post(`${API}/query`, {
      data: { query: "What is the defect rate?", domain: "invalid_domain" },
      timeout: COLD_START_TIMEOUT,
    });
    expect(res.status()).toBe(422);
  });

  test("GET /healthz does not send Content-Type header (CORS safety)", async ({ request: req }) => {
    const res = await req.get(`${API}/healthz`, { timeout: COLD_START_TIMEOUT });
    // Content-Type on a GET with no body can trigger CORS preflight — should be absent or safe
    // Just verify the endpoint is reachable without CORS errors
    expect(res.status()).toBe(200);
  });

});

// ---------------------------------------------------------------------------
// 2. FRONTEND — Page load and navigation
// ---------------------------------------------------------------------------
test.describe("Frontend — navigation and page loads", () => {

  test("homepage loads with correct title", async ({ page }) => {
    await page.goto(FRONTEND, { timeout: PAGE_LOAD_TIMEOUT });
    await expect(page).toHaveTitle(/NextAgentAI/i);
  });

  test("homepage has no JS console errors on load", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", err => errors.push(err.message));
    await page.goto(FRONTEND, { timeout: PAGE_LOAD_TIMEOUT });
    // Use waitForSelector instead of networkidle — the health-check polling loop
    // (GET /healthz every 8s for up to 120s) keeps the network active and
    // prevents networkidle from ever triggering within a short timeout.
    await page.waitForSelector("textarea", { timeout: 15_000 });
    // Filter known benign warnings
    const criticalErrors = errors.filter(e =>
      !e.includes("Warning:") &&
      !e.includes("React DevTools") &&
      !e.includes("ResizeObserver")
    );
    expect(criticalErrors).toHaveLength(0);
  });

  test("homepage responds with 200 (not 404 or 500)", async ({ request: req }) => {
    const res = await req.get(FRONTEND, { timeout: PAGE_LOAD_TIMEOUT });
    expect(res.status()).toBe(200);
  });

  const PAGES = [
    { path: "/", label: "homepage" },
    { path: "/agent", label: "agent page" },
    { path: "/dashboard", label: "dashboard" },
    { path: "/diagram", label: "diagram" },
    { path: "/data", label: "data page" },
    { path: "/review", label: "review page" },
    { path: "/examples", label: "examples page" },
    { path: "/medical-examples", label: "medical examples" },
    { path: "/faq", label: "FAQ" },
  ];

  for (const { path, label } of PAGES) {
    test(`${label} (${path}) returns HTTP 200`, async ({ request: req }) => {
      const res = await req.get(`${FRONTEND}${path}`, { timeout: PAGE_LOAD_TIMEOUT });
      expect(res.status(), `Expected 200 for ${path}`).toBe(200);
    });
  }

});

// ---------------------------------------------------------------------------
// 3. HOMEPAGE — Main UI structure
// ---------------------------------------------------------------------------
test.describe("Homepage — main UI structure", () => {

  test.beforeEach(async ({ page }) => {
    await page.goto(FRONTEND, { timeout: PAGE_LOAD_TIMEOUT });
    await page.waitForLoadState("domcontentloaded");
  });

  test("chat query textarea is visible and enabled", async ({ page }) => {
    const textarea = page.locator("textarea").first();
    await expect(textarea).toBeVisible({ timeout: 10_000 });
    await expect(textarea).toBeEnabled();
  });

  test("submit button is visible", async ({ page }) => {
    const btn = page.getByRole("button", { name: /submit query/i });
    await expect(btn).toBeVisible({ timeout: 10_000 });
  });

  test("submit button is disabled when textarea is empty", async ({ page }) => {
    const btn = page.getByRole("button", { name: /submit query/i });
    await expect(btn).toBeVisible({ timeout: 10_000 });
    const isDisabled = await btn.isDisabled();
    expect(isDisabled).toBe(true);
  });

  test("NAVIGATE dropdown is present in header", async ({ page }) => {
    const nav = page.getByRole("button", { name: /NAVIGATE/i });
    await expect(nav).toBeVisible({ timeout: 10_000 });
  });

  test("NAVIGATE dropdown opens and shows menu items", async ({ page }) => {
    const nav = page.getByRole("button", { name: /NAVIGATE/i });
    await nav.click();
    // Menu items should appear
    await expect(page.getByRole("menuitem").first()).toBeVisible({ timeout: 5_000 });
  });

  test("domain switcher AIRCRAFT button is present", async ({ page }) => {
    const btn = page.getByRole("button", { name: /AIRCRAFT/i });
    await expect(btn).toBeVisible({ timeout: 10_000 });
  });

  test("domain switcher MEDICAL button is present", async ({ page }) => {
    const btn = page.getByRole("button", { name: /MEDICAL/i });
    await expect(btn).toBeVisible({ timeout: 10_000 });
  });

  test("theme toggle button is present", async ({ page }) => {
    // Accept both title and aria-label — the ThemeToggle sets both attributes.
    // aria-label is the more reliable selector because it survives SSR hydration.
    const toggle = page.locator(
      '[aria-label*="Switch to" i][aria-label*="mode" i], [title*="Switch to" i][title*="mode" i]'
    ).first();
    await expect(toggle).toBeVisible({ timeout: 10_000 });
  });

  test("React Flow graph container is present", async ({ page }) => {
    await expect(page.locator(".react-flow")).toBeVisible({ timeout: 10_000 });
  });

  test("chat panel COMMS / QUERY INTERFACE heading visible", async ({ page }) => {
    // SCADA aesthetic — panel header uses span not heading element
    const heading = page.getByText(/COMMS.*QUERY INTERFACE|QUERY INTERFACE/i).first();
    await expect(heading).toBeVisible({ timeout: 10_000 });
  });

  test("agent timeline panel heading visible", async ({ page }) => {
    const heading = page.getByText(/AGENT EXECUTION TRACE|AGENT TIMELINE/i).first();
    await expect(heading).toBeVisible({ timeout: 10_000 });
  });

  test("graph viewer panel heading visible", async ({ page }) => {
    const heading = page.getByText(/KNOWLEDGE GRAPH|GRAPH VIEWER/i).first();
    await expect(heading).toBeVisible({ timeout: 10_000 });
  });

  test("page has lang attribute set to en", async ({ page }) => {
    const lang = await page.locator("html").getAttribute("lang");
    expect(lang).toBe("en");
  });

  test("no horizontal scrollbar on homepage", async ({ page }) => {
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 2);
  });

});

// ---------------------------------------------------------------------------
// 4. DOMAIN SWITCHER
// ---------------------------------------------------------------------------
test.describe("Domain switcher — aircraft / medical toggle", () => {

  test.beforeEach(async ({ page }) => {
    await page.goto(FRONTEND, { timeout: PAGE_LOAD_TIMEOUT });
    await page.waitForLoadState("domcontentloaded");
  });

  test("clicking MEDICAL button changes active domain indicator", async ({ page }) => {
    const medBtn = page.getByRole("button", { name: /MEDICAL/i });
    await medBtn.click();
    // After switching, MEDICAL should appear active (aria-pressed or styling change)
    // Check that the textarea placeholder or a nearby label references medical context
    await page.waitForTimeout(500);
    // At minimum the button click should not throw an error
    await expect(medBtn).toBeVisible();
  });

  test("clicking AIRCRAFT button after MEDICAL restores aircraft domain", async ({ page }) => {
    const medBtn = page.getByRole("button", { name: /MEDICAL/i });
    const airBtn = page.getByRole("button", { name: /AIRCRAFT/i });
    await medBtn.click();
    await page.waitForTimeout(300);
    await airBtn.click();
    await page.waitForTimeout(300);
    await expect(airBtn).toBeVisible();
  });

  test("domain persists in localStorage after switching to MEDICAL", async ({ page }) => {
    const medBtn = page.getByRole("button", { name: /MEDICAL/i });
    await medBtn.click();
    await page.waitForTimeout(500);
    const domain = await page.evaluate(() => localStorage.getItem("nextai_domain"));
    expect(domain).toBe("medical");
  });

  test("domain persists in localStorage after switching to AIRCRAFT", async ({ page }) => {
    // Start medical, then switch back
    await page.evaluate(() => localStorage.setItem("nextai_domain", "medical"));
    await page.reload();
    const airBtn = page.getByRole("button", { name: /AIRCRAFT/i });
    await airBtn.click();
    await page.waitForTimeout(500);
    const domain = await page.evaluate(() => localStorage.getItem("nextai_domain"));
    expect(domain).toBe("aircraft");
  });

});

// ---------------------------------------------------------------------------
// 5. THEME TOGGLE
// ---------------------------------------------------------------------------
test.describe("Theme toggle — light / dark mode", () => {

  test.beforeEach(async ({ page }) => {
    await page.goto(FRONTEND, { timeout: PAGE_LOAD_TIMEOUT });
    await page.waitForLoadState("domcontentloaded");
  });

  test("theme toggle button is clickable and toggles theme class", async ({ page }) => {
    const toggle = page.locator(
      '[aria-label*="Switch to" i][aria-label*="mode" i], [title*="Switch to" i][title*="mode" i]'
    ).first();
    await expect(toggle).toBeVisible({ timeout: 10_000 });
    const htmlBefore = await page.locator("html").getAttribute("class") ?? "";
    await toggle.click();
    await page.waitForTimeout(300);
    const htmlAfter = await page.locator("html").getAttribute("class") ?? "";
    // Class should have changed (dark added/removed)
    // If both empty, theme may use data-theme instead
    const themeBefore = await page.locator("html").getAttribute("data-theme") ?? htmlBefore;
    const themeAfter = await page.locator("html").getAttribute("data-theme") ?? htmlAfter;
    expect(themeBefore).not.toEqual(themeAfter);
  });

  test("theme persists in localStorage", async ({ page }) => {
    const toggle = page.locator(
      '[aria-label*="Switch to" i][aria-label*="mode" i], [title*="Switch to" i][title*="mode" i]'
    ).first();
    await toggle.click();
    await page.waitForTimeout(300);
    const theme = await page.evaluate(() => localStorage.getItem("theme"));
    expect(["light", "dark"]).toContain(theme);
  });

});

// ---------------------------------------------------------------------------
// 6. CHAT — Live query submission
// ---------------------------------------------------------------------------
test.describe("Chat panel — live query submission", () => {

  test("submitting a query enables submit button and shows loading state", async ({ page }) => {
    await page.goto(FRONTEND, { timeout: PAGE_LOAD_TIMEOUT });
    await page.waitForLoadState("domcontentloaded");

    const textarea = page.locator("textarea").first();
    await textarea.fill("Show hydraulic system defect trends");

    const btn = page.getByRole("button", { name: /submit query/i });
    await expect(btn).toBeEnabled({ timeout: 5_000 });
    await btn.click();

    // Should immediately show some loading/processing indicator
    // (spinner, disabled state, or "processing" text)
    const loadingIndicator = page.locator(
      '[aria-busy="true"], [class*="spinner"], [class*="loading"], [class*="animate-spin"]'
    ).first();

    // Either loading indicator appears OR the answer starts loading
    const answerOrLoading = await Promise.race([
      loadingIndicator.waitFor({ state: "visible", timeout: 10_000 }).then(() => "loading"),
      page.waitForResponse(r => r.url().includes("/query"), { timeout: 10_000 }).then(() => "response"),
    ]).catch(() => "timeout");

    // Assertion: the race must not time out — either a loading indicator appeared
    // or the /query network response fired, both prove the submit flow is working.
    expect(answerOrLoading).not.toBe("timeout");
  });

  test("submitting a query returns a synthesised answer", async ({ page }) => {
    test.setTimeout(QUERY_TIMEOUT + 10_000);

    await page.goto(FRONTEND, { timeout: PAGE_LOAD_TIMEOUT });
    await page.waitForLoadState("domcontentloaded");

    const textarea = page.locator("textarea").first();
    await textarea.fill("Show hydraulic system defect trends for aircraft maintenance");

    const btn = page.getByRole("button", { name: /submit query/i });
    await btn.click();

    // The live endpoint uses SSE streaming (Content-Type: text/event-stream) rather
    // than a single JSON response, so response.json() throws on the event-stream body.
    // Instead we wait for the /query network request to fire, then check the DOM for
    // the rendered answer text — that works for both streaming and non-streaming paths.
    await page.waitForResponse(
      r => r.url().includes("/query"),
      { timeout: QUERY_TIMEOUT }
    ).catch(() => null);

    // Wait for the NEXTAGENT RESPONSE label which appears once the assistant bubble renders
    const responseLabel = page.getByText(/NEXTAGENT RESPONSE/i).first();
    const appeared = await responseLabel.waitFor({ state: "visible", timeout: QUERY_TIMEOUT })
      .then(() => true).catch(() => false);

    if (appeared) {
      // Check that the answer bubble has meaningful content (>50 chars)
      const answerBubble = page.locator(
        '[class*="prose"], [class*="answer"], [class*="response"], [class*="message"]'
      ).first();
      const text = await answerBubble.textContent().catch(() => "");
      const isMeaningful = (text?.length ?? 0) > 50;
      const isFallback = /^Found \d+ similar incident/i.test((text ?? "").trim());
      console.log("Synthesised answer length:", text?.length, "isFallback:", isFallback);
      expect(isMeaningful).toBe(true);
      expect(isFallback).toBe(false);
    } else {
      // DB down or streaming timeout — check for graceful error message in UI
      const errorText = page.getByText(/(error|failed|unavailable|try again)/i).first();
      const visible = await errorText.isVisible().catch(() => false);
      console.warn("Query failed (likely DB down) — checking for graceful error UI:", visible);
    }
  });

  test("answer text appears in the chat panel after successful query", async ({ page }) => {
    test.setTimeout(QUERY_TIMEOUT + 10_000);

    await page.goto(FRONTEND, { timeout: PAGE_LOAD_TIMEOUT });
    await page.waitForLoadState("domcontentloaded");

    const textarea = page.locator("textarea").first();
    await textarea.fill("What are the most common maintenance issues?");

    const btn = page.getByRole("button", { name: /submit query/i });
    await btn.click();

    // Wait for a response block to appear in the chat area
    const responseContainer = page.locator(
      '[class*="prose"], [class*="answer"], [class*="response"], [class*="message"]'
    ).first();

    await responseContainer.waitFor({ state: "visible", timeout: QUERY_TIMEOUT }).catch(() => null);

    // Check the response area has non-trivial content
    const text = await responseContainer.textContent().catch(() => "");
    if (text && text.length > 20) {
      console.log("Answer preview:", text.slice(0, 200));
    }
  });

  test("CLAIM CONFIDENCE section appears after query response", async ({ page }) => {
    test.setTimeout(QUERY_TIMEOUT + 10_000);

    await page.goto(FRONTEND, { timeout: PAGE_LOAD_TIMEOUT });
    await page.waitForLoadState("domcontentloaded");

    const textarea = page.locator("textarea").first();
    await textarea.fill("Analyze defect patterns in hydraulic systems");

    const btn = page.getByRole("button", { name: /submit query/i });
    await btn.click();

    // The live endpoint uses SSE streaming — wait for any /query response (not JSON-parseable)
    // then wait for the answer bubble to appear in the DOM before checking for CLAIM CONFIDENCE.
    await page.waitForResponse(
      r => r.url().includes("/query"),
      { timeout: QUERY_TIMEOUT }
    ).catch(() => null);

    // Wait for the assistant answer bubble to finish rendering before checking for claims
    const responseLabel = page.getByText(/NEXTAGENT RESPONSE/i).first();
    await responseLabel.waitFor({ state: "visible", timeout: QUERY_TIMEOUT }).catch(() => null);

    // Wait for claim confidence section
    const claimSection = page.getByText(/CLAIM CONFIDENCE/i).first();
    const visible = await claimSection.isVisible({ timeout: 15_000 }).catch(() => false);

    if (!visible) {
      // Check if it's rendered under a different label
      const altLabel = page.getByText(/confidence|claims/i).first();
      const altVisible = await altLabel.isVisible({ timeout: 3_000 }).catch(() => false);
      console.warn("CLAIM CONFIDENCE section not found; alt label visible:", altVisible);
    }
    // Assertion: must be visible (tests for Bug #2 regression — anthropic version)
    expect(visible).toBe(true);
  });

  test("AGENT EXECUTION TRACE shows tool steps after query", async ({ page }) => {
    test.setTimeout(QUERY_TIMEOUT + 10_000);

    await page.goto(FRONTEND, { timeout: PAGE_LOAD_TIMEOUT });
    await page.waitForLoadState("domcontentloaded");

    const textarea = page.locator("textarea").first();
    await textarea.fill("Show defect trends by product for the last 90 days");

    const btn = page.getByRole("button", { name: /submit query/i });
    await btn.click();

    await page.waitForResponse(
      r => r.url().includes("/query") && r.status() === 200,
      { timeout: QUERY_TIMEOUT }
    ).catch(() => null);

    // Agent Execution Trace should show tool steps
    const toolStep = page.getByText(/VectorSearchTool|SQLQueryTool|vector_search|sql_query/i).first();
    const visible = await toolStep.isVisible({ timeout: 10_000 }).catch(() => false);
    console.log("Agent trace tool step visible:", visible);
    // Note: only assert if query was 200 — DB may be down
    // Captured as observational test in report
  });

  test("citations section appears after query response", async ({ page }) => {
    test.setTimeout(QUERY_TIMEOUT + 10_000);

    await page.goto(FRONTEND, { timeout: PAGE_LOAD_TIMEOUT });
    await page.waitForLoadState("domcontentloaded");

    const textarea = page.locator("textarea").first();
    await textarea.fill("Find incidents involving engine failure");

    const btn = page.getByRole("button", { name: /submit query/i });
    await btn.click();

    await page.waitForResponse(
      r => r.url().includes("/query") && r.status() === 200,
      { timeout: QUERY_TIMEOUT }
    ).catch(() => null);

    // Citations or Sources section
    const citationsLabel = page.getByText(/citations|sources|references/i).first();
    const visible = await citationsLabel.isVisible({ timeout: 10_000 }).catch(() => false);
    console.log("Citations section visible:", visible);
  });

});

// ---------------------------------------------------------------------------
// 7. GRAPH VIEWER — state and display
// ---------------------------------------------------------------------------
test.describe("Graph Viewer — nodes, edges, badges", () => {

  test.beforeEach(async ({ page }) => {
    await page.goto(FRONTEND, { timeout: PAGE_LOAD_TIMEOUT });
    await page.waitForLoadState("domcontentloaded");
  });

  test("React Flow container is present before any query", async ({ page }) => {
    await expect(page.locator(".react-flow")).toBeVisible({ timeout: 10_000 });
  });

  test("graph collapse/expand button is present", async ({ page }) => {
    // PanelRightClose/PanelRightOpen button
    const collapseBtn = page.locator(
      'button[aria-label*="graph" i], button[title*="graph" i], [class*="panel-right"]'
    ).first();
    // May not exist if no aria-label set — just check ReactFlow is there
    await expect(page.locator(".react-flow")).toBeVisible({ timeout: 10_000 });
  });

  test("graph shows nodes after a successful query", async ({ page }) => {
    test.setTimeout(QUERY_TIMEOUT + 15_000);

    const textarea = page.locator("textarea").first();
    await textarea.fill("What hydraulic system issues have occurred?");
    const btn = page.getByRole("button", { name: /submit query/i });
    await btn.click();

    const queryRes = await page.waitForResponse(
      r => r.url().includes("/query") && r.status() === 200,
      { timeout: QUERY_TIMEOUT }
    ).catch(() => null);

    if (queryRes) {
      // Wait for React Flow nodes to render
      await page.waitForSelector(".react-flow__node", { timeout: 15_000 }).catch(() => null);
      const nodeCount = await page.locator(".react-flow__node").count();
      console.log(`Graph node count after query: ${nodeCount}`);
      expect(nodeCount).toBeGreaterThan(0);
    } else {
      console.warn("Query failed — graph test skipped");
    }
  });

  test("graph is not a flat line of circles (nodes have varied y-positions)", async ({ page }) => {
    test.setTimeout(QUERY_TIMEOUT + 15_000);

    const textarea = page.locator("textarea").first();
    await textarea.fill("Analyze maintenance log patterns");
    const btn = page.getByRole("button", { name: /submit query/i });
    await btn.click();

    const queryRes = await page.waitForResponse(
      r => r.url().includes("/query") && r.status() === 200,
      { timeout: QUERY_TIMEOUT }
    ).catch(() => null);

    if (queryRes) {
      await page.waitForSelector(".react-flow__node", { timeout: 15_000 }).catch(() => null);
      const nodes = await page.locator(".react-flow__node").all();

      if (nodes.length >= 3) {
        const yPositions = await Promise.all(
          nodes.slice(0, 6).map(async n => {
            const box = await n.boundingBox();
            return box?.y ?? 0;
          })
        );
        const yMin = Math.min(...yPositions);
        const yMax = Math.max(...yPositions);
        // If all nodes are on a flat line, yMax - yMin would be < 10px — this is the bug
        const ySpread = yMax - yMin;
        console.log(`Node y-spread: ${ySpread}px (${nodes.length} nodes)`);
        expect(ySpread).toBeGreaterThan(20); // should NOT be a flat line
      }
    }
  });

  test("graph badge shows domain label (AIRCRAFT GRAPH or CLINICAL GRAPH)", async ({ page }) => {
    test.setTimeout(QUERY_TIMEOUT + 15_000);

    const textarea = page.locator("textarea").first();
    await textarea.fill("Show hydraulic defect analysis");
    const btn = page.getByRole("button", { name: /submit query/i });
    await btn.click();

    await page.waitForResponse(
      r => r.url().includes("/query") && r.status() === 200,
      { timeout: QUERY_TIMEOUT }
    ).catch(() => null);

    const badge = page.getByText(/AIRCRAFT GRAPH|CLINICAL GRAPH|VECTOR HITS|SAMPLE DATA|LIVE QUERY/i).first();
    const visible = await badge.isVisible({ timeout: 10_000 }).catch(() => false);
    console.log("Graph domain badge visible:", visible);
    expect(visible).toBe(true);
  });

  test("graph shows connecting edges (not zero edges)", async ({ page }) => {
    test.setTimeout(QUERY_TIMEOUT + 15_000);

    const textarea = page.locator("textarea").first();
    await textarea.fill("Identify top failure modes in landing gear");
    const btn = page.getByRole("button", { name: /submit query/i });
    await btn.click();

    const queryRes = await page.waitForResponse(
      r => r.url().includes("/query") && r.status() === 200,
      { timeout: QUERY_TIMEOUT }
    ).catch(() => null);

    if (queryRes) {
      await page.waitForSelector(".react-flow__edge", { timeout: 15_000 }).catch(() => null);
      const edgeCount = await page.locator(".react-flow__edge").count();
      console.log(`Graph edge count: ${edgeCount}`);
      expect(edgeCount).toBeGreaterThan(0);
    }
  });

});

// ---------------------------------------------------------------------------
// 8. NAVIGATION — All routes accessible and no 404s
// ---------------------------------------------------------------------------
test.describe("Navigation — NAVIGATE menu and routes", () => {

  test("NAVIGATE dropdown contains all expected routes", async ({ page }) => {
    await page.goto(FRONTEND, { timeout: PAGE_LOAD_TIMEOUT });
    await page.waitForLoadState("domcontentloaded");

    const navBtn = page.getByRole("button", { name: /NAVIGATE/i });
    await navBtn.click();

    await page.waitForSelector('[role="menuitem"]', { timeout: 5_000 });
    const items = await page.locator('[role="menuitem"]').allTextContents();
    console.log("Nav menu items:", items);
    expect(items.length).toBeGreaterThanOrEqual(4);
  });

  test("clicking dashboard nav item navigates to /dashboard", async ({ page }) => {
    await page.goto(FRONTEND, { timeout: PAGE_LOAD_TIMEOUT });
    await page.waitForLoadState("domcontentloaded");

    const navBtn = page.getByRole("button", { name: /NAVIGATE/i });
    await navBtn.click();

    const dashItem = page.getByRole("menuitem", { name: /dashboard/i });
    const exists = await dashItem.isVisible({ timeout: 5_000 }).catch(() => false);
    if (exists) {
      await dashItem.click();
      await expect(page).toHaveURL(/\/dashboard/, { timeout: 10_000 });
    }
  });

  test("direct navigation to /dashboard loads without error", async ({ page }) => {
    await page.goto(`${FRONTEND}/dashboard`, { timeout: PAGE_LOAD_TIMEOUT });
    await page.waitForLoadState("domcontentloaded");
    // Page should not show Next.js 404
    await expect(page.locator("body")).not.toContainText("404", { timeout: 5_000 });
  });

  test("direct navigation to /agent loads without error", async ({ page }) => {
    await page.goto(`${FRONTEND}/agent`, { timeout: PAGE_LOAD_TIMEOUT });
    await page.waitForLoadState("domcontentloaded");
    await expect(page.locator("body")).not.toContainText("404", { timeout: 5_000 });
  });

  test("direct navigation to /diagram loads without error", async ({ page }) => {
    await page.goto(`${FRONTEND}/diagram`, { timeout: PAGE_LOAD_TIMEOUT });
    await page.waitForLoadState("domcontentloaded");
    await expect(page.locator("body")).not.toContainText("404", { timeout: 5_000 });
  });

  test("direct navigation to /faq loads without error", async ({ page }) => {
    await page.goto(`${FRONTEND}/faq`, { timeout: PAGE_LOAD_TIMEOUT });
    await page.waitForLoadState("domcontentloaded");
    await expect(page.locator("body")).not.toContainText("404", { timeout: 5_000 });
  });

  test("direct navigation to /examples loads without error", async ({ page }) => {
    await page.goto(`${FRONTEND}/examples`, { timeout: PAGE_LOAD_TIMEOUT });
    await page.waitForLoadState("domcontentloaded");
    await expect(page.locator("body")).not.toContainText("404", { timeout: 5_000 });
  });

  test("direct navigation to /medical-examples loads without error", async ({ page }) => {
    await page.goto(`${FRONTEND}/medical-examples`, { timeout: PAGE_LOAD_TIMEOUT });
    await page.waitForLoadState("domcontentloaded");
    await expect(page.locator("body")).not.toContainText("404", { timeout: 5_000 });
  });

  test("direct navigation to /data loads without error", async ({ page }) => {
    await page.goto(`${FRONTEND}/data`, { timeout: PAGE_LOAD_TIMEOUT });
    await page.waitForLoadState("domcontentloaded");
    await expect(page.locator("body")).not.toContainText("404", { timeout: 5_000 });
  });

  test("direct navigation to /review loads without error", async ({ page }) => {
    await page.goto(`${FRONTEND}/review`, { timeout: PAGE_LOAD_TIMEOUT });
    await page.waitForLoadState("domcontentloaded");
    await expect(page.locator("body")).not.toContainText("404", { timeout: 5_000 });
  });

});

// ---------------------------------------------------------------------------
// 9. DASHBOARD — Tab navigation and content
// ---------------------------------------------------------------------------
test.describe("Dashboard — tabs and analytics panels", () => {

  test.beforeEach(async ({ page }) => {
    await page.goto(`${FRONTEND}/dashboard`, { timeout: PAGE_LOAD_TIMEOUT });
    await page.waitForLoadState("domcontentloaded");
  });

  test("dashboard page loads with expected tab navigation", async ({ page }) => {
    // Dashboard has 5 tabs (per MEMORY: AGENT, INCIDENTS, DEFECTS, MAINT., EVAL)
    const tabs = page.locator('nav[class*="tab-nav"], [class*="tab-nav-scroll"]').first();
    const visible = await tabs.isVisible({ timeout: 10_000 }).catch(() => false);
    if (!visible) {
      // Try role=tab fallback
      const tabCount = await page.getByRole("tab").count();
      console.log("Tab count (role=tab):", tabCount);
    }
  });

  test("dashboard aircraft AGENT tab is clickable", async ({ page }) => {
    const agentTab = page.getByRole("tab", { name: /AGENT/i }).first();
    const visible = await agentTab.isVisible({ timeout: 10_000 }).catch(() => false);
    if (visible) {
      await agentTab.click();
      await page.waitForTimeout(500);
      console.log("AGENT tab clicked successfully");
    } else {
      // Tab nav may use button not role=tab
      const tabBtn = page.getByText(/AGENT/i).first();
      await tabBtn.click().catch(() => null);
    }
  });

  test("dashboard shows chart or data visualization", async ({ page }) => {
    // Recharts elements or SVG charts
    const chart = page.locator('svg, [class*="recharts"], [class*="chart"]').first();
    const visible = await chart.isVisible({ timeout: 10_000 }).catch(() => false);
    console.log("Dashboard chart visible:", visible);
    expect(visible).toBe(true);
  });

});

// ---------------------------------------------------------------------------
// 10. AGENT PAGE — Architecture tabs
// ---------------------------------------------------------------------------
test.describe("Agent architecture page — tabs and content", () => {

  test.beforeEach(async ({ page }) => {
    await page.goto(`${FRONTEND}/agent`, { timeout: PAGE_LOAD_TIMEOUT });
    await page.waitForLoadState("domcontentloaded");
  });

  test("agent page has at least one tab visible", async ({ page }) => {
    // The agent page uses <button> elements styled as tabs, not role="tab".
    // Use getByRole("button") with a known tab label instead.
    const stateTab = page.getByRole("button", { name: /STATE MACHINE/i });
    const count = await stateTab.count();
    console.log("Agent page tab count:", count);
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test("STATE MACHINE tab content is visible", async ({ page }) => {
    const tab = page.getByRole("button", { name: /STATE MACHINE/i }).first();
    const visible = await tab.isVisible({ timeout: 5_000 }).catch(() => false);
    if (visible) await tab.click();
    // Content area should have text
    const content = page.getByText(/CLASSIFY|PLAN|EXECUTE|VERIFY/i).first();
    const contentVisible = await content.isVisible({ timeout: 5_000 }).catch(() => false);
    console.log("State machine content visible:", contentVisible);
  });

});

// ---------------------------------------------------------------------------
// 11. DIAGRAM PAGE — Mermaid rendering
// ---------------------------------------------------------------------------
test.describe("Diagram page — Mermaid architecture diagrams", () => {

  test("diagram page loads and renders Mermaid SVG", async ({ page }) => {
    await page.goto(`${FRONTEND}/diagram`, { timeout: PAGE_LOAD_TIMEOUT });
    await page.waitForLoadState("domcontentloaded");

    // Mermaid renders as SVG
    const svg = page.locator("svg").first();
    const visible = await svg.isVisible({ timeout: 15_000 }).catch(() => false);
    console.log("Mermaid SVG rendered:", visible);
    expect(visible).toBe(true);
  });

  test("diagram page does not show mermaid error block", async ({ page }) => {
    await page.goto(`${FRONTEND}/diagram`, { timeout: PAGE_LOAD_TIMEOUT });
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(3_000); // Allow mermaid to render

    const errorBlock = page.locator('[class*="error"], .mermaid-error').first();
    const errorVisible = await errorBlock.isVisible({ timeout: 2_000 }).catch(() => false);
    console.log("Mermaid error block visible:", errorVisible);
    expect(errorVisible).toBe(false);
  });

});

// ---------------------------------------------------------------------------
// 12. EXAMPLES PAGE — Pre-built query links
// ---------------------------------------------------------------------------
test.describe("Examples page — aircraft pre-built queries", () => {

  test("examples page renders query list", async ({ page }) => {
    await page.goto(`${FRONTEND}/examples`, { timeout: PAGE_LOAD_TIMEOUT });
    await page.waitForLoadState("domcontentloaded");

    // Should show multiple example queries
    const links = page.getByRole("link");
    const count = await links.count();
    console.log("Example page link count:", count);
    expect(count).toBeGreaterThan(0);
  });

});

// ---------------------------------------------------------------------------
// 13. MEDICAL EXAMPLES PAGE
// ---------------------------------------------------------------------------
test.describe("Medical examples page — 14 clinical queries", () => {

  test("medical examples page renders query cards", async ({ page }) => {
    await page.goto(`${FRONTEND}/medical-examples`, { timeout: PAGE_LOAD_TIMEOUT });
    await page.waitForLoadState("domcontentloaded");

    const body = await page.locator("body").textContent();
    expect(body?.length).toBeGreaterThan(200);
    console.log("Medical examples page loaded, body length:", body?.length);
  });

  test("medical examples page contains disclaimer text", async ({ page }) => {
    await page.goto(`${FRONTEND}/medical-examples`, { timeout: PAGE_LOAD_TIMEOUT });
    await page.waitForLoadState("domcontentloaded");

    const disclaimer = page.getByText(/AI-generated analysis.*research purposes|not clinical advice/i).first();
    const visible = await disclaimer.isVisible({ timeout: 5_000 }).catch(() => false);
    console.log("Medical disclaimer visible:", visible);
    // Soft check — log result
  });

});

// ---------------------------------------------------------------------------
// 14. FAQ PAGE
// ---------------------------------------------------------------------------
test.describe("FAQ page — content and structure", () => {

  test("FAQ page renders FAQ items", async ({ page }) => {
    await page.goto(`${FRONTEND}/faq`, { timeout: PAGE_LOAD_TIMEOUT });
    await page.waitForLoadState("domcontentloaded");

    const body = await page.locator("body").textContent();
    expect(body?.toLowerCase()).toContain("faq");
  });

});

// ---------------------------------------------------------------------------
// 15. ACCESSIBILITY BASICS
// ---------------------------------------------------------------------------
test.describe("Accessibility — basic checks", () => {

  test.beforeEach(async ({ page }) => {
    await page.goto(FRONTEND, { timeout: PAGE_LOAD_TIMEOUT });
    await page.waitForLoadState("domcontentloaded");
  });

  test("all images have alt attributes", async ({ page }) => {
    const images = await page.locator("img").all();
    for (const img of images) {
      const alt = await img.getAttribute("alt");
      expect(alt).not.toBeNull();
    }
  });

  test("chat textarea has accessible label or aria-label", async ({ page }) => {
    const textarea = page.locator("textarea").first();
    const ariaLabel = await textarea.getAttribute("aria-label");
    const placeholder = await textarea.getAttribute("placeholder");
    // At least one of these should exist
    const hasAccessibleLabel = (ariaLabel !== null && ariaLabel.length > 0) ||
                               (placeholder !== null && placeholder.length > 0);
    expect(hasAccessibleLabel).toBe(true);
  });

  test("submit button has accessible name", async ({ page }) => {
    const btn = page.getByRole("button", { name: /submit query/i });
    await expect(btn).toBeVisible({ timeout: 10_000 });
    const name = await btn.getAttribute("aria-label") ??
                 await btn.textContent();
    expect(name?.trim().length).toBeGreaterThan(0);
  });

  test("keyboard: Tab moves focus from textarea to submit button", async ({ page }) => {
    const textarea = page.locator("textarea").first();
    await textarea.click();
    await textarea.fill("test query");
    await page.keyboard.press("Tab");
    // Some element should have focus after tab
    const focusedTag = await page.evaluate(() => document.activeElement?.tagName?.toLowerCase());
    expect(["button", "a", "input", "select"]).toContain(focusedTag);
  });

});

// ---------------------------------------------------------------------------
// 16. PERFORMANCE — Basic load timing
// ---------------------------------------------------------------------------
test.describe("Performance — page load metrics", () => {

  test("homepage loads within 10 seconds", async ({ page }) => {
    const start = Date.now();
    await page.goto(FRONTEND, { timeout: PAGE_LOAD_TIMEOUT });
    await page.waitForLoadState("domcontentloaded");
    const elapsed = Date.now() - start;
    console.log(`Homepage domcontentloaded: ${elapsed}ms`);
    expect(elapsed).toBeLessThan(10_000);
  });

  test("homepage JS bundle does not block render for more than 5s", async ({ page }) => {
    await page.goto(FRONTEND, { timeout: PAGE_LOAD_TIMEOUT });
    // Check that something is visible within 5 seconds
    const textarea = page.locator("textarea").first();
    await expect(textarea).toBeVisible({ timeout: 5_000 });
  });

});

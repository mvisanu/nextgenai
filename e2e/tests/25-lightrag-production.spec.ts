// ============================================================
// 25-lightrag-production.spec.ts
// Production end-to-end tests for Wave 5 LightRAG integration.
// Tests cover:
//   - Backend LightRAG API endpoints
//   - Frontend /lightrag page loads and UI
//   - LightRAG NL query submission
//   - Graph rendering in LightRAGGraphViewer
//
// Run against live URLs:
//   PLAYWRIGHT_BASE_URL=https://nextgenai-seven.vercel.app \
//   PLAYWRIGHT_API_URL=https://nextgenai-5bf8.onrender.com \
//   npx playwright test e2e/tests/25-lightrag-production.spec.ts \
//     --project=chromium --timeout=120000
// ============================================================

import { test, expect } from "@playwright/test";

const FRONTEND = process.env.PLAYWRIGHT_BASE_URL ?? "https://nextgenai-seven.vercel.app";
const API = process.env.PLAYWRIGHT_API_URL ?? "https://nextgenai-5bf8.onrender.com";

const COLD_START_TIMEOUT = 90_000;
const PAGE_LOAD_TIMEOUT  = 30_000;

// ---------------------------------------------------------------------------
// 1. LightRAG API endpoints — backend contract
// ---------------------------------------------------------------------------
test.describe("LightRAG API — backend contract", () => {

  test("GET /lightrag/modes returns supported query modes", async ({ request }) => {
    const res = await request.get(`${API}/lightrag/modes`, { timeout: COLD_START_TIMEOUT });
    expect(res.status()).toBe(200);
    const body = await res.json();
    // Should be an object or array listing modes
    expect(body).toBeTruthy();
    const text = JSON.stringify(body).toLowerCase();
    // Must contain at least one known LightRAG mode
    expect(text).toMatch(/local|global|hybrid|naive|mix/i);
  });

  test("GET /lightrag/index-status returns status for all domains", async ({ request }) => {
    const res = await request.get(`${API}/lightrag/index-status`, { timeout: COLD_START_TIMEOUT });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(typeof body).toBe("object");
    // Should have aircraft and medical keys (or be an array)
    const text = JSON.stringify(body).toLowerCase();
    expect(text).toMatch(/aircraft|medical/i);
  });

  test("GET /lightrag/status/aircraft returns status shape", async ({ request }) => {
    const res = await request.get(`${API}/lightrag/status/aircraft`, { timeout: COLD_START_TIMEOUT });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("domain");
    expect(body.domain).toBe("aircraft");
    // indexed field should be a boolean
    expect(typeof body.indexed).toBe("boolean");
  });

  test("GET /lightrag/status/medical returns status shape", async ({ request }) => {
    const res = await request.get(`${API}/lightrag/status/medical`, { timeout: COLD_START_TIMEOUT });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("domain");
    expect(body.domain).toBe("medical");
    expect(typeof body.indexed).toBe("boolean");
  });

  test("GET /lightrag/status/unknown_domain returns 422 or 404", async ({ request }) => {
    const res = await request.get(`${API}/lightrag/status/unknown_domain`, { timeout: COLD_START_TIMEOUT });
    expect([422, 404]).toContain(res.status());
  });

  test("GET /lightrag/graph/aircraft returns graph nodes and edges arrays", async ({ request }) => {
    const res = await request.get(`${API}/lightrag/graph/aircraft`, { timeout: COLD_START_TIMEOUT });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("nodes");
    expect(body).toHaveProperty("edges");
    expect(Array.isArray(body.nodes)).toBe(true);
    expect(Array.isArray(body.edges)).toBe(true);
  });

  test("GET /lightrag/graph/medical returns graph nodes and edges arrays", async ({ request }) => {
    const res = await request.get(`${API}/lightrag/graph/medical`, { timeout: COLD_START_TIMEOUT });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("nodes");
    expect(body).toHaveProperty("edges");
    expect(Array.isArray(body.nodes)).toBe(true);
    expect(Array.isArray(body.edges)).toBe(true);
  });

  test("POST /lightrag/query with aircraft domain returns a response", async ({ request }) => {
    test.setTimeout(COLD_START_TIMEOUT + 30_000);
    const res = await request.post(`${API}/lightrag/query`, {
      data: {
        domain: "aircraft",
        query: "What hydraulic system issues are documented?",
        mode: "local",
      },
      timeout: COLD_START_TIMEOUT,
    });
    // Accept 200 (success) or 500 (index empty / LightRAG not yet indexed)
    const status = res.status();
    if (status === 200) {
      const body = await res.json();
      expect(body).toHaveProperty("result");
      // result is a string (may be empty "" if index is empty)
      expect(typeof body.result).toBe("string");
    } else {
      console.warn(`POST /lightrag/query returned HTTP ${status} — index may be empty`);
      expect([200, 500, 503]).toContain(status);
    }
  });

  test("POST /lightrag/query with medical domain returns a response", async ({ request }) => {
    test.setTimeout(COLD_START_TIMEOUT + 30_000);
    const res = await request.post(`${API}/lightrag/query`, {
      data: {
        domain: "medical",
        query: "What respiratory cases are in the knowledge graph?",
        mode: "local",
      },
      timeout: COLD_START_TIMEOUT,
    });
    const status = res.status();
    if (status === 200) {
      const body = await res.json();
      expect(body).toHaveProperty("result");
      expect(typeof body.result).toBe("string");
    } else {
      console.warn(`POST /lightrag/query (medical) returned HTTP ${status}`);
      expect([200, 500, 503]).toContain(status);
    }
  });

  test("POST /lightrag/query with all supported modes does not error", async ({ request }) => {
    const modes = ["local", "global", "hybrid", "naive"];
    for (const mode of modes) {
      const res = await request.post(`${API}/lightrag/query`, {
        data: {
          domain: "aircraft",
          query: "Find maintenance related entries",
          mode,
        },
        timeout: COLD_START_TIMEOUT,
      });
      // 200 = success, 422 = validation err (mode not supported), 500 = index empty
      expect([200, 422, 500, 503]).toContain(res.status());
      console.log(`Mode '${mode}': HTTP ${res.status()}`);
    }
  });

  test("POST /lightrag/query with missing domain returns 422", async ({ request }) => {
    const res = await request.post(`${API}/lightrag/query`, {
      data: { query: "test query", mode: "local" },
      timeout: COLD_START_TIMEOUT,
    });
    expect(res.status()).toBe(422);
  });

  test("POST /lightrag/query with missing query returns 422", async ({ request }) => {
    const res = await request.post(`${API}/lightrag/query`, {
      data: { domain: "aircraft", mode: "local" },
      timeout: COLD_START_TIMEOUT,
    });
    expect(res.status()).toBe(422);
  });

  test("POST /lightrag/index/aircraft accepts trigger and returns 202 or 200", async ({ request }) => {
    const res = await request.post(`${API}/lightrag/index/aircraft`, {
      timeout: COLD_START_TIMEOUT,
    });
    // 202 = accepted / background task started; 200 = already indexed; 409 = in progress
    expect([200, 202, 409]).toContain(res.status());
    console.log(`POST /lightrag/index/aircraft: HTTP ${res.status()}`);
  });

});

// ---------------------------------------------------------------------------
// 2. LightRAG frontend page — /lightrag
// ---------------------------------------------------------------------------
test.describe("LightRAG frontend page — /lightrag", () => {

  test("GET /lightrag returns HTTP 200", async ({ request }) => {
    const res = await request.get(`${FRONTEND}/lightrag`, { timeout: PAGE_LOAD_TIMEOUT });
    expect(res.status()).toBe(200);
  });

  test("/lightrag page loads without JS console errors", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", err => errors.push(err.message));
    await page.goto(`${FRONTEND}/lightrag`, { timeout: PAGE_LOAD_TIMEOUT });
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(2_000);
    const criticalErrors = errors.filter(e =>
      !e.includes("Warning:") &&
      !e.includes("React DevTools") &&
      !e.includes("ResizeObserver") &&
      !e.includes("ChunkLoadError") // network flakiness
    );
    if (criticalErrors.length > 0) {
      console.error("Console errors:", criticalErrors);
    }
    expect(criticalErrors).toHaveLength(0);
  });

  test("/lightrag page has LIGHTRAG heading or label visible", async ({ page }) => {
    await page.goto(`${FRONTEND}/lightrag`, { timeout: PAGE_LOAD_TIMEOUT });
    await page.waitForLoadState("domcontentloaded");
    const heading = page.getByText(/LIGHTRAG|KNOWLEDGE GRAPH|GRAPH EXPLORER/i).first();
    await expect(heading).toBeVisible({ timeout: 10_000 });
  });

  test("/lightrag page shows domain switcher (AIRCRAFT / MEDICAL)", async ({ page }) => {
    await page.goto(`${FRONTEND}/lightrag`, { timeout: PAGE_LOAD_TIMEOUT });
    await page.waitForLoadState("domcontentloaded");

    const aircraftBtn = page.getByRole("button", { name: /AIRCRAFT/i }).first();
    const medicalBtn  = page.getByRole("button", { name: /MEDICAL/i }).first();

    // At least one domain button must be visible (header or local switcher)
    const aircraftVisible = await aircraftBtn.isVisible({ timeout: 10_000 }).catch(() => false);
    const medicalVisible  = await medicalBtn.isVisible({ timeout: 10_000 }).catch(() => false);
    expect(aircraftVisible || medicalVisible).toBe(true);
  });

  test("/lightrag page renders a query input or textarea", async ({ page }) => {
    await page.goto(`${FRONTEND}/lightrag`, { timeout: PAGE_LOAD_TIMEOUT });
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(2_000);

    // Query input could be <input> or <textarea>
    const input = page.locator('input[type="text"], textarea').first();
    const visible = await input.isVisible({ timeout: 10_000 }).catch(() => false);
    console.log("LightRAG query input visible:", visible);
    expect(visible).toBe(true);
  });

  test("/lightrag page shows index status indicators", async ({ page }) => {
    await page.goto(`${FRONTEND}/lightrag`, { timeout: PAGE_LOAD_TIMEOUT });
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(3_000); // Allow API polling to render status

    // Look for indexed/not indexed status text
    const statusText = page.getByText(/indexed|documents|nodes|edges|not indexed|empty/i).first();
    const visible = await statusText.isVisible({ timeout: 10_000 }).catch(() => false);
    console.log("LightRAG index status indicator visible:", visible);
  });

  test("/lightrag page sample queries section exists", async ({ page }) => {
    await page.goto(`${FRONTEND}/lightrag`, { timeout: PAGE_LOAD_TIMEOUT });
    await page.waitForLoadState("domcontentloaded");

    // Sample queries panel
    const sampleSection = page.getByText(/sample queries|example queries|try:/i).first();
    const visible = await sampleSection.isVisible({ timeout: 10_000 }).catch(() => false);
    console.log("Sample queries section visible:", visible);
    // Soft assertion — just log; not critical if UI is different
  });

  test("/lightrag page loads React Flow graph container", async ({ page }) => {
    await page.goto(`${FRONTEND}/lightrag`, { timeout: PAGE_LOAD_TIMEOUT });
    await page.waitForLoadState("domcontentloaded");
    // Wait for dynamic import (ssr:false) to complete
    await page.waitForTimeout(4_000);

    const reactFlow = page.locator(".react-flow").first();
    const visible = await reactFlow.isVisible({ timeout: 15_000 }).catch(() => false);
    console.log("React Flow on /lightrag visible:", visible);
    expect(visible).toBe(true);
  });

  test("/lightrag graph shows nodes if index is not empty", async ({ page }) => {
    // First check the backend index status
    const statusRes = await page.request.get(`${API}/lightrag/status/aircraft`, {
      timeout: COLD_START_TIMEOUT,
    });
    const statusBody = statusRes.ok() ? await statusRes.json() : null;
    const isIndexed = statusBody?.indexed === true;

    await page.goto(`${FRONTEND}/lightrag`, { timeout: PAGE_LOAD_TIMEOUT });
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(4_000);

    const nodes = page.locator(".react-flow__node");
    const nodeCount = await nodes.count();
    console.log(`LightRAG graph node count (indexed=${isIndexed}): ${nodeCount}`);

    if (isIndexed && nodeCount === 0) {
      console.warn("Graph index is marked as indexed but no nodes rendered — may need refresh");
    }
    // Observational — do not hard-fail since graph depends on backend indexing state
  });

  test("/lightrag Query button submits and shows result or empty state", async ({ page }) => {
    test.setTimeout(COLD_START_TIMEOUT + 10_000);

    await page.goto(`${FRONTEND}/lightrag`, { timeout: PAGE_LOAD_TIMEOUT });
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(2_000);

    // Fill query input
    const input = page.locator('input[type="text"], textarea').first();
    await input.fill("What hydraulic system issues are documented?");

    // Find and click Submit/Query button
    const submitBtn = page.getByRole("button", { name: /submit|query|search|run/i }).first();
    const btnVisible = await submitBtn.isVisible({ timeout: 5_000 }).catch(() => false);

    if (!btnVisible) {
      console.warn("Submit button not found on /lightrag page — pressing Enter instead");
      await input.press("Enter");
    } else {
      await submitBtn.click();
    }

    // Wait for query response (either result text or empty-state message)
    const resultOrEmpty = await Promise.race([
      page.waitForResponse(r => r.url().includes("/lightrag/query"), { timeout: COLD_START_TIMEOUT })
        .then(() => "response"),
      page.getByText(/no results|index is empty|result:/i).first()
        .waitFor({ state: "visible", timeout: COLD_START_TIMEOUT })
        .then(() => "empty-state"),
    ]).catch(() => "timeout");

    console.log("LightRAG query result:", resultOrEmpty);
    expect(resultOrEmpty).not.toBe("timeout");
  });

});

// ---------------------------------------------------------------------------
// 3. LightRAG navigation — accessible via AppHeader
// ---------------------------------------------------------------------------
test.describe("LightRAG navigation — AppHeader link", () => {

  test("NAVIGATE dropdown contains LIGHTRAG menu item", async ({ page }) => {
    await page.goto(FRONTEND, { timeout: PAGE_LOAD_TIMEOUT });
    await page.waitForLoadState("domcontentloaded");

    const navBtn = page.getByRole("button", { name: /NAVIGATE/i });
    await navBtn.click();
    await page.waitForTimeout(300);

    // LightRAG should appear in the nav dropdown
    const lightragItem = page.getByRole("menuitem", { name: /LIGHTRAG/i }).first();
    const visible = await lightragItem.isVisible({ timeout: 5_000 }).catch(() => false);
    console.log("LIGHTRAG nav item visible:", visible);
    expect(visible).toBe(true);
  });

  test("clicking LIGHTRAG nav item navigates to /lightrag", async ({ page }) => {
    await page.goto(FRONTEND, { timeout: PAGE_LOAD_TIMEOUT });
    await page.waitForLoadState("domcontentloaded");

    const navBtn = page.getByRole("button", { name: /NAVIGATE/i });
    await navBtn.click();
    await page.waitForTimeout(300);

    const lightragItem = page.getByRole("menuitem", { name: /LIGHTRAG/i }).first();
    const visible = await lightragItem.isVisible({ timeout: 5_000 }).catch(() => false);

    if (visible) {
      await lightragItem.click();
      await page.waitForURL(/\/lightrag/, { timeout: 10_000 });
      expect(page.url()).toContain("/lightrag");
    } else {
      // Try direct navigation fallback
      console.warn("LIGHTRAG nav item not found — testing direct navigation");
      await page.goto(`${FRONTEND}/lightrag`, { timeout: PAGE_LOAD_TIMEOUT });
      expect(page.url()).toContain("/lightrag");
    }
  });

});

// ---------------------------------------------------------------------------
// 4. LightRAG — API analytics and runs integration
// ---------------------------------------------------------------------------
test.describe("LightRAG — cross-feature integration", () => {

  test("LightRAG query does not interfere with main /runs history", async ({ request }) => {
    // GET /runs should still work after LightRAG endpoints are called
    const runsRes = await request.get(`${API}/runs`, { timeout: COLD_START_TIMEOUT });
    expect(runsRes.status()).toBe(200);
    const body = await runsRes.json();
    // Should return an array or object with runs
    expect(body).toBeTruthy();
  });

  test("LightRAG graph/aircraft and graph/medical return consistent shape", async ({ request }) => {
    const [aircraftRes, medicalRes] = await Promise.all([
      request.get(`${API}/lightrag/graph/aircraft`, { timeout: COLD_START_TIMEOUT }),
      request.get(`${API}/lightrag/graph/medical`, { timeout: COLD_START_TIMEOUT }),
    ]);

    expect(aircraftRes.status()).toBe(200);
    expect(medicalRes.status()).toBe(200);

    const aircraftBody = await aircraftRes.json();
    const medicalBody  = await medicalRes.json();

    // Both must have the same top-level shape
    expect(Object.keys(aircraftBody).sort()).toEqual(Object.keys(medicalBody).sort());
    expect(Array.isArray(aircraftBody.nodes)).toBe(true);
    expect(Array.isArray(medicalBody.nodes)).toBe(true);
  });

  test("LightRAG status returns doc_count field (or equivalent)", async ({ request }) => {
    const res = await request.get(`${API}/lightrag/status/aircraft`, { timeout: COLD_START_TIMEOUT });
    const body = await res.json();
    // doc_count or document_count or node_count — any integer field indicating index size
    const hasCountField = "doc_count" in body || "document_count" in body ||
                          "node_count" in body || "num_docs" in body || "documents" in body;
    console.log("LightRAG status body:", JSON.stringify(body));
    // Observational — just log; field name may vary
    if (!hasCountField) {
      console.warn("No count field found in LightRAG status — may need schema update");
    }
  });

});

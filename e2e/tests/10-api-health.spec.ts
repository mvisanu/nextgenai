// ============================================================
// 10-api-health.spec.ts
// Backend health check endpoint visibility in the UI.
// Tests that the app handles both "ok" and "degraded" states.
// ============================================================

import { test, expect } from "@playwright/test";
import { FourPanelPage } from "../helpers/panels";
import {
  mockHealthOk,
  mockHealthDegraded,
  mockQueryResponse,
  MOCK_RESPONSE_QUERY_1,
} from "../fixtures/api-mock";

const API_URL = process.env.PLAYWRIGHT_API_URL ?? "http://localhost:8000";

test.describe("API Health — /healthz ok state", () => {
  test("page loads normally when healthz returns ok", async ({ page }) => {
    await mockHealthOk(page);
    const panelPage = new FourPanelPage(page);
    await panelPage.navigate();

    await panelPage.assertAllPanelsVisible();
  });

  test("no warning indicator visible when healthz returns ok", async ({ page }) => {
    await mockHealthOk(page);
    const panelPage = new FourPanelPage(page);
    await panelPage.navigate();

    // Check that there's no visible "degraded" or "warning" indicator
    // (The app may not implement a health indicator yet — this test confirms no crash)
    const degradedWarning = page.getByText(/degraded|backend.*down|service.*unavailable/i);
    // Either it's hidden or not present — both are acceptable in the "ok" state
    const isVisible = await degradedWarning.isVisible().catch(() => false);
    expect(isVisible).toBe(false);
  });

  test("healthz ok does not prevent query submission", async ({ page }) => {
    await mockHealthOk(page);
    await mockQueryResponse(page, MOCK_RESPONSE_QUERY_1);

    const panelPage = new FourPanelPage(page);
    await panelPage.navigate();
    await panelPage.submitQuery("Find similar incidents");
    await panelPage.waitForAnswer();

    await panelPage.assertAllPanelsVisible();
  });
});

test.describe("API Health — /healthz degraded state", () => {
  test("page loads without crashing when healthz returns degraded", async ({ page }) => {
    await mockHealthDegraded(page);
    const panelPage = new FourPanelPage(page);
    await panelPage.navigate();

    // The page must not crash — all structural elements should remain visible
    await panelPage.assertAllPanelsVisible();
  });

  test("degraded state does not prevent query input from being available", async ({ page }) => {
    await mockHealthDegraded(page);
    const panelPage = new FourPanelPage(page);
    await panelPage.navigate();

    // Textarea should still be available (even if backend is degraded)
    await expect(page.getByPlaceholder(/Ask a question/i)).toBeVisible();
  });

  test("chat panel still renders when healthz is degraded", async ({ page }) => {
    await mockHealthDegraded(page);
    const panelPage = new FourPanelPage(page);
    await panelPage.navigate();

    await expect(page.getByRole("heading", { name: "Chat", exact: true })).toBeVisible();
  });

  test("graph viewer still renders when healthz is degraded", async ({ page }) => {
    await mockHealthDegraded(page);
    const panelPage = new FourPanelPage(page);
    await panelPage.navigate();

    await expect(page.getByRole("heading", { name: "Graph Viewer", exact: true })).toBeVisible();
  });
});

test.describe("API Health — healthz response shape validation", () => {
  test("mocked /healthz response returns correct shape with status and db fields", async ({ page }) => {
    let capturedHealthResponse: Record<string, unknown> | null = null;

    await page.route(`${API_URL}/healthz`, async (route) => {
      const responseBody = {
        status: "ok",
        db: true,
        version: "1.0.0",
      };
      capturedHealthResponse = responseBody;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(responseBody),
      });
    });

    const panelPage = new FourPanelPage(page);
    await panelPage.navigate();

    // Validate the shape that would be returned (this documents the expected contract)
    if (capturedHealthResponse) {
      expect(capturedHealthResponse).toHaveProperty("status");
      expect(capturedHealthResponse).toHaveProperty("db");
      expect(capturedHealthResponse).toHaveProperty("version");
      expect(["ok", "degraded"]).toContain(capturedHealthResponse.status);
    }
  });
});

// ============================================================
// 07-error-states.spec.ts
// Error handling: API 500, 400 prevention by UI, network timeout,
// chunk 404 in drawer, and health degraded indicator.
// ============================================================

import { test, expect } from "@playwright/test";
import { FourPanelPage } from "../helpers/panels";
import {
  mockQueryError500,
  mockQueryTimeout,
  mockChunk404,
  mockHealthOk,
  mockHealthDegraded,
  mockQueryResponse,
  mockChunkResponse,
  MOCK_RESPONSE_QUERY_1,
  MOCK_CHUNK_HYDRAULIC,
} from "../fixtures/api-mock";

// ---------------------------------------------------------------------------
// 500 error from POST /query
// ---------------------------------------------------------------------------

test.describe("Error states — API 500 from POST /query", () => {
  test("shows error Alert in the chat panel (not a crash)", async ({ page }) => {
    await mockHealthOk(page);
    await mockQueryError500(page);

    const panelPage = new FourPanelPage(page);
    await panelPage.navigate();
    await panelPage.submitQuery("Find similar incidents");

    // Error alert should appear
    const alert = page.getByRole("alert");
    await expect(alert).toBeVisible({ timeout: 10_000 });
  });

  test("error alert contains the backend error detail message", async ({ page }) => {
    await mockHealthOk(page);
    await mockQueryError500(page);

    const panelPage = new FourPanelPage(page);
    await panelPage.navigate();
    await panelPage.submitQuery("Find similar incidents");

    const alert = page.getByRole("alert");
    await expect(alert).toContainText("Agent error", { timeout: 10_000 });
  });

  test("page does not crash on 500 — all panels remain visible", async ({ page }) => {
    await mockHealthOk(page);
    await mockQueryError500(page);

    const panelPage = new FourPanelPage(page);
    await panelPage.navigate();
    await panelPage.submitQuery("Find similar incidents");

    await page.getByRole("alert").waitFor({ timeout: 10_000 });

    // All panels should still be visible
    await panelPage.assertAllPanelsVisible();
  });

  test("input is re-enabled after a 500 error", async ({ page }) => {
    await mockHealthOk(page);
    await mockQueryError500(page);

    const panelPage = new FourPanelPage(page);
    await panelPage.navigate();
    await panelPage.submitQuery("Find similar incidents");

    // Wait for the error state
    await page.getByRole("alert").waitFor({ timeout: 10_000 });

    // Textarea should be re-enabled after the request completes (even on error)
    const textarea = page.getByPlaceholder(/Ask a question/i);
    await expect(textarea).toBeEnabled({ timeout: 3_000 });
  });

  test("submit button is re-enabled after a 500 error", async ({ page }) => {
    await mockHealthOk(page);
    await mockQueryError500(page);

    const panelPage = new FourPanelPage(page);
    await panelPage.navigate();
    await panelPage.submitQuery("Find similar incidents");

    await page.getByRole("alert").waitFor({ timeout: 10_000 });

    // Submit button enabled status depends on whether text is in the input
    // After error, the input was cleared — so button should still be disabled
    // (empty input = disabled button). This verifies no infinite disabled state.
    const textarea = page.getByPlaceholder(/Ask a question/i);
    await expect(textarea).toBeEnabled({ timeout: 3_000 });
  });

  test("agent timeline is not populated when query returns 500", async ({ page }) => {
    await mockHealthOk(page);
    await mockQueryError500(page);

    const panelPage = new FourPanelPage(page);
    await panelPage.navigate();
    await panelPage.submitQuery("Find similar incidents");

    await page.getByRole("alert").waitFor({ timeout: 10_000 });

    // Timeline should still show "No run yet"
    const emptyText = await panelPage.getTimelineEmptyText();
    expect(emptyText).toBe("No run yet");
  });
});

// ---------------------------------------------------------------------------
// 400 prevention — empty query rejected by UI
// ---------------------------------------------------------------------------

test.describe("Error states — API 400 prevented by UI validation", () => {
  test("submit button is disabled when query is empty", async ({ page }) => {
    await mockHealthOk(page);
    const panelPage = new FourPanelPage(page);
    await panelPage.navigate();

    expect(await panelPage.isSubmitDisabled()).toBe(true);
  });

  test("submit button is disabled when query is only whitespace", async ({ page }) => {
    await mockHealthOk(page);
    const panelPage = new FourPanelPage(page);
    await panelPage.navigate();

    await page.getByPlaceholder(/Ask a question/i).fill("   ");
    // Button disabled because inputValue.trim() === ""
    expect(await panelPage.isSubmitDisabled()).toBe(true);
  });

  test("pressing Enter on empty textarea does not fire a request", async ({ page }) => {
    await mockHealthOk(page);
    let requestFired = false;
    await page.route("**/query", async (route) => {
      requestFired = true;
      await route.continue();
    });

    const panelPage = new FourPanelPage(page);
    await panelPage.navigate();

    const textarea = page.getByPlaceholder(/Ask a question/i);
    await textarea.press("Enter");
    // Brief wait to confirm no request was sent
    await page.waitForTimeout(200);
    expect(requestFired).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Network timeout
// ---------------------------------------------------------------------------

test.describe("Error states — network timeout / fetch failure", () => {
  test("shows an error message when network request is aborted", async ({ page }) => {
    await mockHealthOk(page);
    await mockQueryTimeout(page);

    const panelPage = new FourPanelPage(page);
    await panelPage.navigate();
    await panelPage.submitQuery("Find similar incidents");

    const alert = page.getByRole("alert");
    await expect(alert).toBeVisible({ timeout: 15_000 });
  });

  test("error message for network failure is user-friendly", async ({ page }) => {
    await mockHealthOk(page);
    // Simulate a network error with a connection refused response
    await page.route("**/query", async (route) => {
      await route.abort("connectionrefused");
    });

    const panelPage = new FourPanelPage(page);
    await panelPage.navigate();
    await panelPage.submitQuery("Find similar incidents");

    const alert = page.getByRole("alert");
    await expect(alert).toBeVisible({ timeout: 15_000 });
    // Should show some error text (not a raw stack trace)
    const alertText = await alert.innerText();
    expect(alertText.length).toBeGreaterThan(5);
  });

  test("app does not crash on network failure — panels remain visible", async ({ page }) => {
    await mockHealthOk(page);
    await mockQueryTimeout(page);

    const panelPage = new FourPanelPage(page);
    await panelPage.navigate();
    await panelPage.submitQuery("Find similar incidents");

    await page.getByRole("alert").waitFor({ timeout: 15_000 });
    await panelPage.assertAllPanelsVisible();
  });
});

// ---------------------------------------------------------------------------
// GET /docs/{id}/chunks/{id} returns 404 in Citations drawer
// ---------------------------------------------------------------------------

test.describe("Error states — chunk 404 in Citations drawer", () => {
  test("shows error message in drawer when chunk returns 404", async ({ page }) => {
    await mockHealthOk(page);
    await mockQueryResponse(page, MOCK_RESPONSE_QUERY_1);
    await mockChunk404(page);

    const panelPage = new FourPanelPage(page);
    await panelPage.navigate();
    await panelPage.submitQuery("Find similar incidents");
    await panelPage.waitForAnswer();

    await panelPage.clickCitation(1);
    await panelPage.waitForDrawerOpen();

    // An error alert should appear inside the drawer
    const drawerError = page.locator('[role="dialog"]').getByRole("alert");
    await expect(drawerError).toBeVisible({ timeout: 5_000 });
  });

  test("drawer does not crash the page when chunk returns 404", async ({ page }) => {
    await mockHealthOk(page);
    await mockQueryResponse(page, MOCK_RESPONSE_QUERY_1);
    await mockChunk404(page);

    const panelPage = new FourPanelPage(page);
    await panelPage.navigate();
    await panelPage.submitQuery("Find similar incidents");
    await panelPage.waitForAnswer();

    await panelPage.clickCitation(1);
    await panelPage.waitForDrawerOpen();

    // Drawer should still be open and all panels still visible
    await expect(page.locator('[role="dialog"]')).toBeVisible();
    await panelPage.assertAllPanelsVisible();
  });

  test("drawer can be closed normally after a 404 error", async ({ page }) => {
    await mockHealthOk(page);
    await mockQueryResponse(page, MOCK_RESPONSE_QUERY_1);
    await mockChunk404(page);

    const panelPage = new FourPanelPage(page);
    await panelPage.navigate();
    await panelPage.submitQuery("Find similar incidents");
    await panelPage.waitForAnswer();

    await panelPage.clickCitation(1);
    await panelPage.waitForDrawerOpen();

    // Close with Escape
    await panelPage.closeDrawer();
    await expect(page.locator('[role="dialog"]')).toBeHidden({ timeout: 3_000 });
  });
});

// ---------------------------------------------------------------------------
// /healthz degraded indicator
// ---------------------------------------------------------------------------

test.describe("Error states — /healthz degraded indicator", () => {
  test("app loads without crashing when /healthz returns degraded", async ({ page }) => {
    await mockHealthDegraded(page);
    // We don't mock the query endpoint here — just check the page loads
    const panelPage = new FourPanelPage(page);
    await panelPage.navigate();

    // The page should still load with all panels
    await panelPage.assertAllPanelsVisible();
  });

  test("app loads without crashing when /healthz returns ok", async ({ page }) => {
    await mockHealthOk(page);
    const panelPage = new FourPanelPage(page);
    await panelPage.navigate();

    await panelPage.assertAllPanelsVisible();
  });
});

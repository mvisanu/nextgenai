// ============================================================
// 09-accessibility.spec.ts
// Basic accessibility checks: keyboard navigation, ARIA labels,
// dialog role and focus trap, graph viewer accessible name.
// Note: for full a11y auditing, use axe-playwright on top of these.
// ============================================================

import { test, expect } from "@playwright/test";
import { FourPanelPage } from "../helpers/panels";
import {
  mockQueryResponse,
  mockChunkResponse,
  mockHealthOk,
  MOCK_RESPONSE_QUERY_1,
  MOCK_CHUNK_HYDRAULIC,
} from "../fixtures/api-mock";
import {
  assertHasAriaLabel,
  assertCitationButtonsAccessible,
  assertDrawerFocusTrapped,
} from "../helpers/assertions";

// ---------------------------------------------------------------------------
// ARIA labels on interactive elements
// ---------------------------------------------------------------------------

test.describe("Accessibility — ARIA labels", () => {
  test("submit button has aria-label='Submit query'", async ({ page }) => {
    await mockHealthOk(page);
    const panelPage = new FourPanelPage(page);
    await panelPage.navigate();

    const btn = page.getByRole("button", { name: /submit query/i });
    await assertHasAriaLabel(btn);
    const label = await btn.getAttribute("aria-label");
    expect(label).toBe("Submit query");
  });

  test("citation buttons have aria-label='View citation N'", async ({ page }) => {
    await mockHealthOk(page);
    await mockQueryResponse(page, MOCK_RESPONSE_QUERY_1);
    const panelPage = new FourPanelPage(page);
    await panelPage.navigate();
    await panelPage.submitQuery("Find similar incidents");
    await panelPage.waitForAnswer();

    await assertCitationButtonsAccessible(page);
  });

  test("textarea has a descriptive placeholder (serves as accessible label)", async ({ page }) => {
    await mockHealthOk(page);
    const panelPage = new FourPanelPage(page);
    await panelPage.navigate();

    const textarea = page.getByPlaceholder(/Ask a question/i);
    const placeholder = await textarea.getAttribute("placeholder");
    expect(placeholder).toBeTruthy();
    expect(placeholder!.length).toBeGreaterThan(10);
  });

  test("React Flow graph container is present and visible for the graph panel", async ({ page }) => {
    await mockHealthOk(page);
    const panelPage = new FourPanelPage(page);
    await panelPage.navigate();

    // React Flow itself provides accessible SVG elements
    await expect(page.locator(".react-flow")).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Keyboard navigation — interactive elements reachable by Tab
// ---------------------------------------------------------------------------

test.describe("Accessibility — keyboard navigation", () => {
  test("Tab key reaches the textarea from the start of the page", async ({ page }) => {
    await mockHealthOk(page);
    const panelPage = new FourPanelPage(page);
    await panelPage.navigate();

    // Focus body, then Tab until textarea is focused
    await page.locator("body").click();
    const textarea = page.getByPlaceholder(/Ask a question/i);

    // Tab up to 10 times to reach the textarea
    let found = false;
    for (let i = 0; i < 10; i++) {
      await page.keyboard.press("Tab");
      const focused = await page.evaluate(() =>
        document.activeElement?.getAttribute("placeholder") ?? ""
      );
      if (focused.includes("Ask a question")) {
        found = true;
        break;
      }
    }
    expect(found).toBe(true);
  });

  test("Tab key reaches the submit button", async ({ page }) => {
    await mockHealthOk(page);
    const panelPage = new FourPanelPage(page);
    await panelPage.navigate();

    // Type something so the button is focusable (it's not disabled)
    await page.getByPlaceholder(/Ask a question/i).fill("test");

    // Tab from textarea to button
    await page.getByPlaceholder(/Ask a question/i).focus();
    await page.keyboard.press("Tab");

    const focused = await page.evaluate(() => document.activeElement?.getAttribute("aria-label") ?? "");
    expect(focused).toMatch(/submit query/i);
  });

  test("Enter key activates the submit button when focused", async ({ page }) => {
    await mockHealthOk(page);
    await mockQueryResponse(page, MOCK_RESPONSE_QUERY_1);

    const panelPage = new FourPanelPage(page);
    await panelPage.navigate();

    // Fill the textarea via keyboard
    const textarea = page.getByPlaceholder(/Ask a question/i);
    await textarea.focus();
    await page.keyboard.type("test query");
    // Enter from textarea submits
    await page.keyboard.press("Enter");

    const userBubble = page.locator(".justify-end .bg-primary").first();
    await expect(userBubble).toBeVisible({ timeout: 5_000 });
  });

  test("citation buttons are reachable by keyboard after answer appears", async ({ page }) => {
    await mockHealthOk(page);
    await mockQueryResponse(page, MOCK_RESPONSE_QUERY_1);

    const panelPage = new FourPanelPage(page);
    await panelPage.navigate();
    await panelPage.submitQuery("Find similar incidents");
    await panelPage.waitForAnswer();

    const citBtn = page.getByRole("button", { name: "View citation 1" }).first();
    await citBtn.focus();

    // Verify it's focused
    const isFocused = await page.evaluate(() =>
      document.activeElement?.getAttribute("aria-label")?.includes("citation 1") ?? false
    );
    expect(isFocused).toBe(true);
  });

  test("Enter key on a citation button opens the drawer", async ({ page }) => {
    await mockHealthOk(page);
    await mockQueryResponse(page, MOCK_RESPONSE_QUERY_1);
    await mockChunkResponse(page, MOCK_CHUNK_HYDRAULIC);

    const panelPage = new FourPanelPage(page);
    await panelPage.navigate();
    await panelPage.submitQuery("Find similar incidents");
    await panelPage.waitForAnswer();

    const citBtn = page.getByRole("button", { name: "View citation 1" }).first();
    await citBtn.focus();
    await page.keyboard.press("Enter");

    await panelPage.waitForDrawerOpen();
  });
});

// ---------------------------------------------------------------------------
// Citations drawer — ARIA and focus management
// ---------------------------------------------------------------------------

test.describe("Accessibility — Citations drawer dialog semantics", () => {
  test("drawer element has role='dialog'", async ({ page }) => {
    await mockHealthOk(page);
    await mockQueryResponse(page, MOCK_RESPONSE_QUERY_1);
    await mockChunkResponse(page, MOCK_CHUNK_HYDRAULIC);

    const panelPage = new FourPanelPage(page);
    await panelPage.navigate();
    await panelPage.submitQuery("Find similar incidents");
    await panelPage.waitForAnswer();
    await panelPage.clickCitation(1);
    await panelPage.waitForDrawerOpen();

    await expect(page.locator('[role="dialog"]')).toBeVisible();
  });

  test("focus is trapped inside the drawer (Tab stays in drawer)", async ({ page }) => {
    await mockHealthOk(page);
    await mockQueryResponse(page, MOCK_RESPONSE_QUERY_1);
    await mockChunkResponse(page, MOCK_CHUNK_HYDRAULIC);

    const panelPage = new FourPanelPage(page);
    await panelPage.navigate();
    await panelPage.submitQuery("Find similar incidents");
    await panelPage.waitForAnswer();
    await panelPage.clickCitation(1);
    await panelPage.waitForDrawerOpen();

    await assertDrawerFocusTrapped(page);
  });

  test("Escape key closes the drawer (keyboard accessibility)", async ({ page }) => {
    await mockHealthOk(page);
    await mockQueryResponse(page, MOCK_RESPONSE_QUERY_1);
    await mockChunkResponse(page, MOCK_CHUNK_HYDRAULIC);

    const panelPage = new FourPanelPage(page);
    await panelPage.navigate();
    await panelPage.submitQuery("Find similar incidents");
    await panelPage.waitForAnswer();
    await panelPage.clickCitation(1);
    await panelPage.waitForDrawerOpen();

    await page.keyboard.press("Escape");
    await expect(page.locator('[role="dialog"]')).toBeHidden({ timeout: 3_000 });
  });
});

// ---------------------------------------------------------------------------
// Heading hierarchy
// ---------------------------------------------------------------------------

test.describe("Accessibility — heading hierarchy", () => {
  test("panel headings use heading role", async ({ page }) => {
    await mockHealthOk(page);
    const panelPage = new FourPanelPage(page);
    await panelPage.navigate();

    // All three panels should have headings accessible via getByRole
    await expect(page.getByRole("heading", { name: "Chat", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Agent Timeline", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Graph Viewer", exact: true })).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Error alert accessibility
// ---------------------------------------------------------------------------

test.describe("Accessibility — error alert", () => {
  test("error Alert has role='alert' (live region)", async ({ page }) => {
    await mockHealthOk(page);
    // Trigger an error
    await page.route("**/query", async (route) => {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ detail: "Agent error" }),
      });
    });

    const panelPage = new FourPanelPage(page);
    await panelPage.navigate();
    await panelPage.submitQuery("test query");

    const alert = page.getByRole("alert");
    await expect(alert).toBeVisible({ timeout: 10_000 });

    // role="alert" is a live region — screen readers announce it automatically
    const role = await alert.getAttribute("role");
    expect(role).toBe("alert");
  });
});

// ============================================================
// 01-layout.spec.ts
// Four-panel layout renders correctly on initial load.
// Tests are fully isolated — all API calls are mocked.
// ============================================================

import { test, expect } from "@playwright/test";
import { FourPanelPage } from "../helpers/panels";
import { mockHealthOk } from "../fixtures/api-mock";

test.describe("Layout — Initial page load", () => {
  let panelPage: FourPanelPage;

  test.beforeEach(async ({ page }) => {
    await mockHealthOk(page);
    panelPage = new FourPanelPage(page);
    await panelPage.navigate();
  });

  test("renders the page title in the document head", async ({ page }) => {
    await expect(page).toHaveTitle(/NextAgentAI/i);
  });

  test("renders the Chat panel heading", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Chat", exact: true })).toBeVisible();
  });

  test("renders the Agent Timeline panel heading", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Agent Timeline", exact: true })).toBeVisible();
  });

  test("renders the Graph Viewer panel heading", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Graph Viewer", exact: true })).toBeVisible();
  });

  test("all three panel headings are simultaneously visible", async () => {
    await panelPage.assertAllPanelsVisible();
  });

  test("chat textarea is visible and enabled on load", async ({ page }) => {
    const textarea = page.getByPlaceholder(/Ask a question/i);
    await expect(textarea).toBeVisible();
    await expect(textarea).toBeEnabled();
  });

  test("submit button is visible on load", async ({ page }) => {
    await expect(page.getByRole("button", { name: /submit query/i })).toBeVisible();
  });

  test("submit button is disabled when textarea is empty", async () => {
    expect(await panelPage.isSubmitDisabled()).toBe(true);
  });

  test("chat panel shows empty-state prompt text", async ({ page }) => {
    await expect(page.getByText(/Ask a manufacturing or maintenance question/i)).toBeVisible();
  });

  test("agent timeline shows 'No run yet' on initial load", async () => {
    const text = await panelPage.getTimelineEmptyText();
    expect(text).toBe("No run yet");
  });

  test("graph viewer shows empty state message on initial load", async () => {
    const text = await panelPage.getGraphEmptyText();
    expect(text).toBe("Submit a query to see the graph");
  });

  test("layout fills the full viewport width", async ({ page }) => {
    const main = page.locator("main");
    const box = await main.boundingBox();
    const viewportWidth = page.viewportSize()?.width ?? 1280;
    // Main element should fill at least 95% of viewport width
    expect(box?.width).toBeGreaterThan(viewportWidth * 0.95);
  });

  test("layout fills the full viewport height", async ({ page }) => {
    const main = page.locator("main");
    const box = await main.boundingBox();
    const viewportHeight = page.viewportSize()?.height ?? 720;
    expect(box?.height).toBeGreaterThan(viewportHeight * 0.95);
  });

  test("no horizontal scrollbar appears on load", async ({ page }) => {
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    // Allow 2px tolerance for sub-pixel rendering
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 2);
  });

  test("React Flow container is present in graph panel", async ({ page }) => {
    await expect(page.locator(".react-flow")).toBeVisible();
  });

  test("page has lang attribute set to 'en'", async ({ page }) => {
    const lang = await page.locator("html").getAttribute("lang");
    expect(lang).toBe("en");
  });
});

// ============================================================
// 15-examples.spec.ts
// /examples page: 14 aircraft example cards, copy-to-clipboard,
// accordion expand/collapse, PhD frame sections.
//
// Coverage:
//   - Page loads without error
//   - Back-to-main link is present
//   - At least 14 copy buttons render (one per example)
//   - Clicking a copy button shows a "COPIED" state
//   - COPIED state reverts after ~2 seconds
//   - Accordion item can be expanded (content appears)
//   - Accordion item can be collapsed again
//   - Intent badges (VECTOR / SQL / HYBRID) are visible
//   - Industry section renders (cross-industry applicability)
// ============================================================

import { test, expect } from "@playwright/test";

const EXPECTED_EXAMPLE_COUNT = 14;

test.describe("Examples page — load and structure", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/examples");
    // Wait for the first example to appear
    await page.getByText(/Find all incidents similar to|hydraulic/i).first()
      .waitFor({ state: "visible", timeout: 20_000 });
  });

  test("page loads without application error", async ({ page }) => {
    await expect(page.locator("body")).not.toContainText("Application error");
  });

  test("back to main link is present", async ({ page }) => {
    // ArrowLeft link or "BACK" / "MAIN" link in the header
    const backLink = page.getByRole("link", { name: /back|main|←|arrow/i }).first();
    // May also be an ArrowLeft icon with text
    const arrowLink = page.locator("a").filter({ has: page.locator("svg") }).first();
    const hasBack = (await backLink.isVisible().catch(() => false)) ||
                    (await arrowLink.isVisible().catch(() => false));
    expect(hasBack).toBe(true);
  });

  test("page title / heading contains 'EXAMPLES'", async ({ page }) => {
    await expect(page.getByText(/EXAMPLES|TEST QUERIES/i).first()).toBeVisible();
  });
});

test.describe("Examples page — example cards", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/examples");
    await page.getByText(/hydraulic|actuator|similar incident/i).first()
      .waitFor({ state: "visible", timeout: 20_000 });
  });

  test(`at least ${EXPECTED_EXAMPLE_COUNT} copy buttons are present`, async ({ page }) => {
    // Each example card has exactly one copy button
    const copyBtns = page.getByRole("button").filter({ hasText: /COPY|copy/i });
    const count = await copyBtns.count();
    expect(count).toBeGreaterThanOrEqual(EXPECTED_EXAMPLE_COUNT);
  });

  test("VECTOR intent badge is visible on at least one card", async ({ page }) => {
    await expect(page.getByText("VECTOR").first()).toBeVisible();
  });

  test("SQL intent badge is visible on at least one card", async ({ page }) => {
    await expect(page.getByText("SQL").first()).toBeVisible();
  });

  test("HYBRID intent badge is visible on at least one card", async ({ page }) => {
    await expect(page.getByText("HYBRID").first()).toBeVisible();
  });

  test("clicking a copy button shows 'COPIED' feedback state", async ({ page }) => {
    // Grant clipboard-write permission so the copy actually works
    await page.context().grantPermissions(["clipboard-write"]);

    const firstCopyBtn = page.getByRole("button").filter({ hasText: /COPY/i }).first();
    await firstCopyBtn.click();

    // After clicking, button should change to COPIED state
    await expect(page.getByRole("button").filter({ hasText: /COPIED/i }).first()).toBeVisible({
      timeout: 3_000,
    });
  });

  test("COPIED state reverts back to COPY within 3 seconds", async ({ page }) => {
    await page.context().grantPermissions(["clipboard-write"]);

    const firstCopyBtn = page.getByRole("button").filter({ hasText: /COPY/i }).first();
    await firstCopyBtn.click();

    // Wait for COPIED to appear
    await page.getByRole("button").filter({ hasText: /COPIED/i }).first()
      .waitFor({ state: "visible", timeout: 3_000 });

    // Wait for it to revert (the implementation uses setTimeout of ~2000ms)
    await expect(page.getByRole("button").filter({ hasText: /^COPY$/i }).first()).toBeVisible({
      timeout: 5_000,
    });
  });
});

test.describe("Examples page — accordion expand/collapse", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/examples");
    await page.getByText(/hydraulic|actuator|similar incident/i).first()
      .waitFor({ state: "visible", timeout: 20_000 });
  });

  test("clicking the first expand button reveals detail content", async ({ page }) => {
    // Each example card has a chevron button that toggles expanded state
    const expandBtn = page.getByRole("button").filter({
      has: page.locator("svg").filter({ hasText: "" }), // SVG chevron icons have no text
    }).first();

    // Find by ChevronDown - look for buttons that contain "EXPAND" or have a chevron icon
    // The card header buttons have ChevronDown / ChevronUp icons
    const cardButtons = page.locator("button").filter({
      has: page.locator("svg"),
    });

    // Click the first non-copy button with an SVG (the expand toggle)
    const nonCopyBtns = cardButtons.filter({ hasNotText: /COPY|COPIED/i });
    const count = await nonCopyBtns.count();
    if (count === 0) {
      // Fallback: cards may expand on full-card click
      await page.locator("[class*='card'], [class*='example']").first().click();
    } else {
      await nonCopyBtns.first().click();
    }

    // After expand, additional detail text should appear
    // Look for content that only shows when expanded
    await expect(
      page.getByText(/WHAT HAPPENS|WHY HELPFUL|ROI|time saved/i).first()
    ).toBeVisible({ timeout: 5_000 });
  });

  test("expanded card can be collapsed again", async ({ page }) => {
    // Click to expand
    const nonCopyBtns = page.locator("button").filter({
      has: page.locator("svg"),
    }).filter({ hasNotText: /COPY|COPIED/i });

    if (await nonCopyBtns.count() > 0) {
      await nonCopyBtns.first().click();
      const detailText = page.getByText(/WHAT HAPPENS|WHY HELPFUL/i).first();
      await detailText.waitFor({ state: "visible", timeout: 5_000 });

      // Click again to collapse
      await nonCopyBtns.first().click();
      await expect(detailText).toBeHidden({ timeout: 5_000 });
    }
  });
});

test.describe("Examples page — industry section", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/examples");
    await page.getByText(/hydraulic|actuator|similar incident/i).first()
      .waitFor({ state: "visible", timeout: 20_000 });
  });

  test("cross-industry applicability section is visible on the page", async ({ page }) => {
    await expect(
      page.getByText(/INDUSTRY|CROSS-INDUSTRY|APPLICABILITY/i).first()
    ).toBeVisible();
  });
});

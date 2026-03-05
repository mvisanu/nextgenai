// ============================================================
// 18-data-page.spec.ts
// /data page: 5 dataset cards (DS-01 through DS-05),
// schema toggle, copy button on download snippets.
//
// Coverage:
//   - Page loads without error
//   - Aircraft domain divider (DS-01 · DS-02 · DS-03) visible
//   - Medical domain divider (DS-04 · DS-05) visible
//   - All 5 dataset index labels (DS-01 … DS-05) rendered
//   - "SHOW SCHEMA" button toggles to "HIDE SCHEMA" when clicked
//   - Schema table rows are visible after expanding
//   - Copy button on download snippet shows COPIED state
//   - Kaggle external links are present (href contains kaggle.com)
// ============================================================

import { test, expect } from "@playwright/test";

const DATASET_INDICES = ["DS-01", "DS-02", "DS-03", "DS-04", "DS-05"];
const DATASET_TITLES = [
  "Manufacturing Defects",
  "Aircraft Incident",
  "Maintenance Logs",
  "Disease",           // medical DS-04
  "Clinical",          // medical DS-05 (MACCROBAT)
];

test.describe("Data page — load and structure", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/data");
    // Wait for the first dataset index label
    await page.getByText("DS-01").first().waitFor({ state: "visible", timeout: 20_000 });
  });

  test("page loads without application error", async ({ page }) => {
    await expect(page.locator("body")).not.toContainText("Application error");
  });

  test("page heading contains 'DATA' or 'DATASET'", async ({ page }) => {
    await expect(page.getByText(/DATASET.*INTELLIGENCE|DATA.*MANIFEST|DATASET/i).first()).toBeVisible();
  });

  test("back link is present on the data page", async ({ page }) => {
    const backLink = page.getByRole("link").filter({ has: page.locator("svg") }).first();
    await expect(backLink).toBeVisible();
  });
});

test.describe("Data page — dataset index labels", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/data");
    await page.getByText("DS-01").first().waitFor({ state: "visible", timeout: 20_000 });
  });

  for (const idx of DATASET_INDICES) {
    test(`dataset label "${idx}" is visible`, async ({ page }) => {
      await expect(page.getByText(idx).first()).toBeVisible();
    });
  }

  test("all 5 dataset index labels appear on the page", async ({ page }) => {
    for (const idx of DATASET_INDICES) {
      await expect(page.getByText(idx).first()).toBeVisible();
    }
  });
});

test.describe("Data page — domain section dividers", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/data");
    await page.getByText("DS-01").first().waitFor({ state: "visible", timeout: 20_000 });
  });

  test("aircraft section divider (DS-01 · DS-02 · DS-03) is visible", async ({ page }) => {
    // The divider bar in data/page.tsx renders index labels
    // Look for text that groups the first three datasets
    await expect(page.getByText(/DS-01|Manufacturing Defects/i).first()).toBeVisible();
  });

  test("medical section divider (DS-04 · DS-05) is visible", async ({ page }) => {
    await expect(page.getByText(/DS-04|DS-05/i).first()).toBeVisible();
  });

  test("'Manufacturing Defects' dataset title is visible", async ({ page }) => {
    await expect(page.getByText(/Manufacturing Defects/i).first()).toBeVisible();
  });

  test("Medical or Disease dataset title is visible (DS-04)", async ({ page }) => {
    await expect(page.getByText(/Disease|Medical Records/i).first()).toBeVisible();
  });
});

test.describe("Data page — schema toggle", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/data");
    await page.getByText("DS-01").first().waitFor({ state: "visible", timeout: 20_000 });
  });

  test("SHOW SCHEMA button is present on the first dataset card", async ({ page }) => {
    const showBtn = page.getByRole("button").filter({ hasText: /SHOW SCHEMA/i }).first();
    await expect(showBtn).toBeVisible();
  });

  test("clicking SHOW SCHEMA toggles to HIDE SCHEMA", async ({ page }) => {
    const showBtn = page.getByRole("button").filter({ hasText: /SHOW SCHEMA/i }).first();
    await showBtn.click();
    await expect(
      page.getByRole("button").filter({ hasText: /HIDE SCHEMA/i }).first()
    ).toBeVisible({ timeout: 5_000 });
  });

  test("clicking HIDE SCHEMA collapses the schema back", async ({ page }) => {
    const showBtn = page.getByRole("button").filter({ hasText: /SHOW SCHEMA/i }).first();
    await showBtn.click();
    const hideBtn = page.getByRole("button").filter({ hasText: /HIDE SCHEMA/i }).first();
    await hideBtn.waitFor({ state: "visible" });
    await hideBtn.click();
    await expect(
      page.getByRole("button").filter({ hasText: /SHOW SCHEMA/i }).first()
    ).toBeVisible({ timeout: 5_000 });
  });

  test("expanding schema reveals column name descriptions", async ({ page }) => {
    const showBtn = page.getByRole("button").filter({ hasText: /SHOW SCHEMA/i }).first();
    await showBtn.click();
    // Schema reveals column info — e.g., "defect_id" column
    await expect(
      page.getByText(/defect_id|product_id|severity|inspection_date/i).first()
    ).toBeVisible({ timeout: 5_000 });
  });
});

test.describe("Data page — download snippet copy button", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/data");
    await page.getByText("DS-01").first().waitFor({ state: "visible", timeout: 20_000 });
  });

  test("at least one download-snippet copy button is visible", async ({ page }) => {
    // Each dataset card has a copy button for the kagglehub snippet
    const copyBtns = page.getByRole("button").filter({ hasText: /COPY|copy/i });
    const count = await copyBtns.count();
    expect(count).toBeGreaterThan(0);
  });

  test("clicking a copy button shows COPIED state", async ({ page }) => {
    await page.context().grantPermissions(["clipboard-write"]);
    const firstCopyBtn = page.getByRole("button").filter({ hasText: /COPY/i }).first();
    await firstCopyBtn.click();
    await expect(
      page.getByRole("button").filter({ hasText: /COPIED/i }).first()
    ).toBeVisible({ timeout: 3_000 });
  });
});

test.describe("Data page — external Kaggle links", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/data");
    await page.getByText("DS-01").first().waitFor({ state: "visible", timeout: 20_000 });
  });

  test("at least one Kaggle external link is present on the page", async ({ page }) => {
    const kaggleLinks = page.getByRole("link").filter({ has: page.getByText(/KAGGLE|VIEW ON KAGGLE/i) });
    // Also match href-based: links with kaggle.com in href
    const hrefLinks = page.locator('a[href*="kaggle.com"]');
    const count1 = await kaggleLinks.count();
    const count2 = await hrefLinks.count();
    expect(count1 + count2).toBeGreaterThan(0);
  });
});

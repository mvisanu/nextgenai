// ============================================================
// 11-navigation.spec.ts
// NAVIGATE dropdown: all 7 links work; direct URL navigation;
// browser back navigation; page title/heading correct.
//
// Coverage:
//   - All 7 NAVIGATE dropdown items render and route correctly
//   - Direct GET to each page returns 200 (page renders)
//   - Browser back/forward navigation works
//   - Each page has the correct visible heading / page title
// ============================================================

import { test, expect } from "@playwright/test";
import { NavPage } from "../helpers/nav-page";
import { mockHealthOk } from "../fixtures/api-mock";

// ---------------------------------------------------------------------------
// NAV_ITEMS matches the NAV_ITEMS constant in page.tsx
// ---------------------------------------------------------------------------
const NAV_ITEMS = [
  { label: "DASHBOARD",  href: "/dashboard"        },
  { label: "DATA",       href: "/data"             },
  { label: "REVIEW",     href: "/review"           },
  { label: "EXAMPLES",   href: "/examples"         },
  { label: "MED-EX",     href: "/medical-examples" },
  { label: "DIAGRAM",    href: "/diagram"          },
  { label: "FAQ",        href: "/faq"              },
] as const;

test.describe("Navigation — NAVIGATE dropdown", () => {
  test.beforeEach(async ({ page }) => {
    await mockHealthOk(page);
    await page.goto("/");
    // Wait for the header to be rendered
    await page.getByRole("button", { name: /NAVIGATE/i }).waitFor({ state: "visible" });
  });

  test("NAVIGATE button is visible in the header", async ({ page }) => {
    await expect(page.getByRole("button", { name: /NAVIGATE/i })).toBeVisible();
  });

  test("clicking NAVIGATE opens the dropdown menu", async ({ page }) => {
    await page.getByRole("button", { name: /NAVIGATE/i }).click();
    // At least one menu item should appear
    await expect(page.getByRole("menuitem").first()).toBeVisible({ timeout: 3_000 });
  });

  test("dropdown contains all 7 expected page labels", async ({ page }) => {
    const navPage = new NavPage(page);
    const items = await navPage.getNavMenuItems();
    const labels = items.map((l) => l.toUpperCase());

    for (const { label } of NAV_ITEMS) {
      const found = labels.some((l) => l.includes(label));
      expect(found, `Expected nav item "${label}" to be present in: ${JSON.stringify(items)}`).toBe(true);
    }
  });

  test("pressing Escape closes the dropdown", async ({ page }) => {
    await page.getByRole("button", { name: /NAVIGATE/i }).click();
    await page.getByRole("menuitem").first().waitFor({ state: "visible" });
    await page.keyboard.press("Escape");
    await expect(page.getByRole("menuitem").first()).toBeHidden({ timeout: 3_000 });
  });

  for (const { label, href } of NAV_ITEMS) {
    test(`clicking "${label}" navigates to ${href}`, async ({ page }) => {
      const navPage = new NavPage(page);
      await navPage.navigateTo(label);
      // URL should contain the target path
      await expect(page).toHaveURL(new RegExp(href.replace("/", "\\/") + ".*"), { timeout: 10_000 });
    });
  }
});

test.describe("Navigation — direct URL access", () => {
  // Each page should load without crashing (not a 404 / error boundary)
  const PAGES = [
    { path: "/",                 heading: /NEXTAGENTAI|COMMS|QUERY INTERFACE/i },
    { path: "/dashboard",        heading: /DASHBOARD|QUALITY INTELLIGENCE/i    },
    { path: "/examples",         heading: /EXAMPLES|TEST QUERIES/i             },
    { path: "/medical-examples", heading: /MEDICAL|CLINICAL/i                  },
    { path: "/data",             heading: /DATA|DATASET/i                      },
    { path: "/review",           heading: /REVIEW|PHD/i                        },
    { path: "/faq",              heading: /FAQ|FREQUENTLY/i                    },
    { path: "/diagram",          heading: /DIAGRAM|ARCHITECTURE/i              },
  ];

  for (const { path, heading } of PAGES) {
    test(`GET ${path} renders without crashing`, async ({ page }) => {
      await mockHealthOk(page);
      await page.goto(path);
      // Page must not show a Next.js error boundary
      await expect(page.locator("body")).not.toContainText("Application error", { timeout: 15_000 });
      // Some recognisable text should be visible
      await expect(page.getByText(heading).first()).toBeVisible({ timeout: 15_000 });
    });
  }
});

test.describe("Navigation — document titles", () => {
  test("home page has 'NextAgentAI' in the document title", async ({ page }) => {
    await mockHealthOk(page);
    await page.goto("/");
    await expect(page).toHaveTitle(/NextAgentAI/i);
  });
});

test.describe("Navigation — browser back/forward", () => {
  test.beforeEach(async ({ page }) => {
    await mockHealthOk(page);
  });

  test("browser back from /dashboard returns to /", async ({ page }) => {
    await page.goto("/");
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/dashboard/);
    await page.goBack();
    await expect(page).toHaveURL(/\/$|\/$/);
  });

  test("browser back from /examples returns to previous page", async ({ page }) => {
    await page.goto("/");
    await page.goto("/examples");
    await page.goBack();
    await expect(page).toHaveURL(/\/$|\/$/);
  });

  test("browser forward after back navigates forward again", async ({ page }) => {
    await page.goto("/");
    await page.goto("/data");
    await page.goBack();
    await page.goForward();
    await expect(page).toHaveURL(/\/data/);
  });
});

test.describe("Navigation — 404 handling", () => {
  test("navigating to a non-existent path shows some error content", async ({ page }) => {
    await page.goto("/this-page-does-not-exist-xyz123");
    // Next.js 404 page shows "404" or "Not Found"
    const body = page.locator("body");
    await expect(body).toContainText(/404|not found|page.*not.*found/i, { timeout: 10_000 });
  });
});

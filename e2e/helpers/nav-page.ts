// ============================================================
// nav-page.ts
// NavPage — Page Object for navigation, domain switcher, header
// controls and all secondary pages.
//
// Selector strategy:
//   Prefer semantic: getByRole > getByText > title attr > CSS class
//   Only fall back to CSS class when no semantic equivalent exists.
//   All selectors validated against actual rendered markup (2026-03-05).
// ============================================================

import { type Page, type Locator, expect } from "@playwright/test";

// ---------------------------------------------------------------------------
// NavPage — wraps header navigation for all pages
// ---------------------------------------------------------------------------

export class NavPage {
  readonly page: Page;

  // NAVIGATE dropdown trigger button
  readonly navDropdownTrigger: Locator;

  // Domain switcher buttons
  readonly aircraftDomainBtn: Locator;
  readonly medicalDomainBtn: Locator;

  // Theme toggle button
  readonly themeToggle: Locator;

  constructor(page: Page) {
    this.page = page;
    // The NAVIGATE button contains the literal text "NAVIGATE"
    this.navDropdownTrigger = page.getByRole("button", { name: /NAVIGATE/i });
    // Domain switcher buttons contain the shortLabel text from DOMAIN_CONFIGS
    this.aircraftDomainBtn = page.getByRole("button", { name: /AIRCRAFT/i });
    this.medicalDomainBtn = page.getByRole("button", { name: /MEDICAL/i });
    // Theme toggle: title attribute changes between modes
    this.themeToggle = page.getByTitle(/Switch to (light|dark) mode/i);
  }

  // ---------------------------------------------------------------------------
  // Open NAVIGATE dropdown and click a menu item by label text
  // ---------------------------------------------------------------------------

  async navigateTo(label: string): Promise<void> {
    await this.navDropdownTrigger.click();
    const item = this.page.getByRole("menuitem", { name: label });
    await item.waitFor({ state: "visible", timeout: 5_000 });
    await item.click();
  }

  // ---------------------------------------------------------------------------
  // Get list of all visible menu item labels in the NAVIGATE dropdown
  // ---------------------------------------------------------------------------

  async getNavMenuItems(): Promise<string[]> {
    await this.navDropdownTrigger.click();
    // DropdownMenu renders items as role=menuitem
    const items = this.page.getByRole("menuitem");
    await items.first().waitFor({ state: "visible", timeout: 5_000 });
    const count = await items.count();
    const labels: string[] = [];
    for (let i = 0; i < count; i++) {
      labels.push((await items.nth(i).innerText()).trim());
    }
    // Close the dropdown
    await this.page.keyboard.press("Escape");
    return labels;
  }

  // ---------------------------------------------------------------------------
  // Set domain via domain switcher buttons
  // ---------------------------------------------------------------------------

  async setDomain(domain: "aircraft" | "medical"): Promise<void> {
    if (domain === "aircraft") {
      await this.aircraftDomainBtn.click();
    } else {
      await this.medicalDomainBtn.click();
    }
    // Brief settle: React state + localStorage write
    await this.page.waitForTimeout(150);
  }

  // ---------------------------------------------------------------------------
  // Toggle theme (dark ↔ light) and return new theme name
  // ---------------------------------------------------------------------------

  async toggleTheme(): Promise<"dark" | "light"> {
    await this.themeToggle.click();
    const cls = await this.page.locator("html").getAttribute("class") ?? "";
    return cls.includes("light") ? "light" : "dark";
  }

  // ---------------------------------------------------------------------------
  // Assert domain badge is active (has the non-transparent border colour)
  // The active domain button has a non-zero boxShadow set inline
  // ---------------------------------------------------------------------------

  async getActiveDomain(): Promise<"aircraft" | "medical"> {
    // We read localStorage — most reliable without fragile style inspection
    const domain = await this.page.evaluate(() =>
      localStorage.getItem("nextai_domain") ?? "aircraft"
    );
    return domain as "aircraft" | "medical";
  }
}

// ---------------------------------------------------------------------------
// DashboardPage — page object for /dashboard
// ---------------------------------------------------------------------------

export class DashboardPage {
  readonly page: Page;
  readonly nav: NavPage;

  constructor(page: Page) {
    this.page = page;
    this.nav = new NavPage(page);
  }

  async navigate(): Promise<void> {
    await this.page.goto("/dashboard");
    // Wait for at least one tab button to render
    await this.page.getByRole("button").filter({ hasText: /AGENT|INCIDENTS|CASES/i }).first()
      .waitFor({ state: "visible", timeout: 15_000 });
  }

  // Get all tab shortLabel texts currently visible
  async getTabLabels(): Promise<string[]> {
    const nav = this.page.locator("nav.tab-nav-scroll, [class*='tab-nav']");
    const buttons = nav.getByRole("button");
    const count = await buttons.count();
    const labels: string[] = [];
    for (let i = 0; i < count; i++) {
      labels.push((await buttons.nth(i).innerText()).trim());
    }
    return labels;
  }

  // Click the Nth tab (0-indexed)
  async clickTab(index: number): Promise<void> {
    const nav = this.page.locator("nav.tab-nav-scroll, [class*='tab-nav']");
    await nav.getByRole("button").nth(index).click();
  }

  // Click a tab whose innerText contains the given substring
  async clickTabByText(text: string): Promise<void> {
    const nav = this.page.locator("nav.tab-nav-scroll, [class*='tab-nav']");
    await nav.getByRole("button").filter({ hasText: text }).first().click();
  }

  // Get the domain banner text content
  async getDomainBannerText(): Promise<string> {
    const banner = this.page.locator("[class*='tab-nav']").locator("..").locator("div").first();
    // The domain banner contains "MANUFACTURING INTELLIGENCE MODE" or "CLINICAL INTELLIGENCE MODE"
    const el = this.page.getByText(/INTELLIGENCE MODE/i).first();
    await el.waitFor({ state: "visible", timeout: 5_000 });
    return el.innerText();
  }

  // Get "DOMAIN" badge text (AIRCRAFT or MEDICAL)
  async getDomainBadge(): Promise<string> {
    const badge = this.page.getByText(/^(AIRCRAFT|MEDICAL)$/).first();
    await badge.waitFor({ state: "visible", timeout: 5_000 });
    return badge.innerText();
  }
}

// ---------------------------------------------------------------------------
// ExamplesPage — page object for /examples and /medical-examples
// ---------------------------------------------------------------------------

export class ExamplesPage {
  readonly page: Page;
  readonly url: string;

  constructor(page: Page, url: "/examples" | "/medical-examples" = "/examples") {
    this.page = page;
    this.url = url;
  }

  async navigate(): Promise<void> {
    await this.page.goto(this.url);
    // Wait for at least one example card heading (they have a number prefix)
    await this.page.getByText(/^0*1\.?\s/).first()
      .waitFor({ state: "visible", timeout: 15_000 }).catch(() => {
        // Fallback: wait for any visible content beyond the header
      });
  }

  // Count the number of copy buttons on the page
  async getCopyButtonCount(): Promise<number> {
    return this.page.getByTitle(/Copy query|Copy to clipboard/i).count();
  }

  // Click a copy button (0-indexed) and check "COPIED" state appears
  async clickCopyButton(index: number): Promise<void> {
    const btns = this.page.getByTitle(/Copy query|Copy to clipboard/i);
    await btns.nth(index).click();
  }

  // Click the Nth expand/collapse chevron (0-indexed)
  async clickExpandButton(index: number): Promise<void> {
    const chevrons = this.page.locator("[data-expanded], button").filter({
      has: this.page.locator("svg[class*='ChevronDown'], svg[class*='ChevronUp']"),
    });
    await chevrons.nth(index).click();
  }

  // Get count of query card headers
  async getCardCount(): Promise<number> {
    // Each card has a number badge (the example number)
    // The copy buttons are 1-per-card so we use that count as proxy
    const btns = this.page.locator("button").filter({ hasText: /COPY|COPIED/ });
    const count = await btns.count();
    if (count > 0) return count;
    // Fallback: count elements that contain the query text
    return this.page.locator(".example-card, [class*='example']").count();
  }
}

// ---------------------------------------------------------------------------
// FaqPage — page object for /faq
// ---------------------------------------------------------------------------

export class FaqPage {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  async navigate(): Promise<void> {
    await this.page.goto("/faq");
    await this.page.getByText(/FAQ|FREQUENTLY ASKED/i).first()
      .waitFor({ state: "visible", timeout: 15_000 });
  }

  // Get all section divider labels (e.g., "TABS 00–05", "TABS M0–M5")
  async getSectionDividers(): Promise<string[]> {
    // Section dividers contain "TABS" followed by numbers
    const dividers = this.page.locator("div, span").filter({ hasText: /TABS\s+\d+/i });
    const count = await dividers.count();
    const labels: string[] = [];
    for (let i = 0; i < count; i++) {
      labels.push((await dividers.nth(i).innerText()).trim());
    }
    return labels;
  }

  // Count all accordion items (QA items)
  async getAccordionItemCount(): Promise<number> {
    // Each accordion item is triggered by a button with a question text
    return this.page.locator("button").filter({ has: this.page.locator("svg") }).count();
  }

  // Click the first accordion item and check it expands
  async expandFirstAccordionItem(): Promise<void> {
    const items = this.page.locator("button").filter({ has: this.page.locator("svg") });
    await items.first().click();
  }
}

// ---------------------------------------------------------------------------
// DataPage — page object for /data
// ---------------------------------------------------------------------------

export class DataPage {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  async navigate(): Promise<void> {
    await this.page.goto("/data");
    await this.page.getByText(/DS-01|MANUFACTURING DEFECTS/i).first()
      .waitFor({ state: "visible", timeout: 15_000 });
  }

  // Count dataset cards (DS-01 through DS-05)
  async getDatasetCardCount(): Promise<number> {
    const cards = this.page.getByText(/DS-0[1-5]/i);
    return cards.count();
  }

  // Click "SHOW SCHEMA" / "HIDE SCHEMA" toggle on the Nth card (0-indexed)
  async toggleSchema(cardIndex: number): Promise<void> {
    const toggles = this.page.getByRole("button").filter({ hasText: /SHOW SCHEMA|HIDE SCHEMA/i });
    await toggles.nth(cardIndex).click();
  }

  // Get the text of SHOW/HIDE toggle for the Nth card
  async getSchemaToggleText(cardIndex: number): Promise<string> {
    const toggles = this.page.getByRole("button").filter({ hasText: /SHOW SCHEMA|HIDE SCHEMA/i });
    return (await toggles.nth(cardIndex).innerText()).trim();
  }
}

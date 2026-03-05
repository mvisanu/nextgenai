# E2E Test Suite Documentation — NextAgentAI

**Version:** 2.0
**Updated:** 2026-03-05
**Framework:** Playwright (TypeScript)
**Browsers:** Chromium (primary), Firefox, WebKit
**Test count:** 10 original files + 10 new files = ~200 individual tests

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Installation and Setup](#2-installation-and-setup)
3. [Environment Variables](#3-environment-variables)
4. [Running the Full Suite](#4-running-the-full-suite)
5. [Running Specific Tests](#5-running-specific-tests)
6. [Running Against the Live Deployment](#6-running-against-the-live-deployment)
7. [Interpreting the HTML Report](#7-interpreting-the-html-report)
8. [CI/CD Integration](#8-cicd-integration)
9. [Mock vs Live Backend](#9-mock-vs-live-backend)
10. [Test Data Management](#10-test-data-management)
11. [File Index](#11-file-index)
12. [Coverage Summary](#12-coverage-summary)
13. [Known Flaky Tests and Mitigation](#13-known-flaky-tests-and-mitigation)
14. [Adding New Tests](#14-adding-new-tests)
15. [Bug Report](#15-bug-report)

---

## 1. Prerequisites

| Requirement | Version | Notes |
|---|---|---|
| Node.js | 20+ | Required by Next.js 16 and Playwright |
| npm | 10+ | Used for installing Playwright |
| Frontend dev server | running on port 3005 | `npm run dev` in `frontend/` |
| Backend (optional) | running on port 8000 | Only needed for `19-api-contract.spec.ts` |
| Docker (optional) | any | For full-stack local dev via `docker compose up` |

The test suite is designed to run **entirely with a mocked backend** for all tests except `19-api-contract.spec.ts`. You do NOT need a live database, Kaggle credentials, or an Anthropic API key to run any of the other test files. The mock responses in `e2e/fixtures/test-data.ts` simulate all three PRD demo queries accurately.

---

## 2. Installation and Setup

```bash
# From the repo root — install Playwright and its browsers
cd /c/Users/Bruce/source/repos/NextAgentAI
npm install          # installs @playwright/test (already in devDependencies)
npx playwright install --with-deps   # downloads Chromium, Firefox, WebKit
```

No additional build steps are required. The `playwright.config.ts` at the repo root starts the Next.js dev server automatically (via `webServer`) before running tests.

---

## 3. Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PLAYWRIGHT_BASE_URL` | `http://localhost:3005` | Frontend URL to test against |
| `PLAYWRIGHT_API_URL` | `http://localhost:8000` | Backend API URL for mocks and live tests |
| `SKIP_WEBSERVER` | unset | Set to `true` to skip starting the dev server (e.g., in CI when already running) |
| `SKIP_LIVE_API_TESTS` | unset | Set to `true` to skip `19-api-contract.spec.ts` live API tests |
| `CI` | unset | Set automatically by GitHub Actions; enables retries and GitHub reporter |

To test against the live Vercel/Render deployment:

```bash
PLAYWRIGHT_BASE_URL=https://nextgenai-seven.vercel.app \
PLAYWRIGHT_API_URL=https://nextai-backend.onrender.com \
SKIP_WEBSERVER=true \
npx playwright test
```

---

## 4. Running the Full Suite

```bash
# From the repo root (where playwright.config.ts lives)
npm run test:e2e
# or directly:
npx playwright test
```

This will:
1. Start the Next.js dev server (port 3005)
2. Run all specs in `e2e/tests/` across Chromium, Firefox, and WebKit
3. Generate an HTML report at `playwright-report/index.html`

---

## 5. Running Specific Tests

```bash
# Run a single test file
npx playwright test e2e/tests/11-navigation.spec.ts

# Run tests matching a string
npx playwright test --grep "domain switcher"

# Run only Chromium
npm run test:e2e:chromium

# Run only Firefox
npm run test:e2e:firefox

# Run only WebKit
npm run test:e2e:webkit

# Run in headed mode (see the browser)
npm run test:e2e:headed

# Run with Playwright UI (interactive mode)
npm run test:e2e:ui

# Run a specific test group (all navigation tests)
npx playwright test 11-navigation

# Skip live API tests (default in most CI runs)
SKIP_LIVE_API_TESTS=true npx playwright test

# Run ONLY the live API contract tests
npx playwright test 19-api-contract
```

---

## 6. Running Against the Live Deployment

```bash
# Full suite against Vercel + Render (note: backend cold-start may cause 60s delay)
PLAYWRIGHT_BASE_URL=https://nextgenai-seven.vercel.app \
PLAYWRIGHT_API_URL=https://nextai-backend.onrender.com \
SKIP_WEBSERVER=true \
SKIP_LIVE_API_TESTS=false \
npx playwright test
```

**Warning:** The Render free-tier backend has a cold-start delay of up to 60 seconds. Tests have a 60-second timeout for API calls, but the initial health check retry logic (up to 15 retries × 8s = 2 minutes) may cause some tests to time out on a cold backend. The test suite is configured with `retries: 2` on CI to mitigate this.

---

## 7. Interpreting the HTML Report

```bash
# Open the report (after running tests)
npm run test:e2e:report
# or
npx playwright show-report
```

The HTML report opens at `playwright-report/index.html` and shows:

- **Green**: Test passed
- **Red**: Test failed — click to expand the error, screenshot, and trace
- **Yellow/Orange**: Test was flaky (passed on retry)

**Screenshots** are captured automatically on first failure. They appear in the test detail view.

**Videos** are recorded on the first retry of a failing test.

**Traces** are recorded on the first retry. To view a trace:
```bash
npx playwright show-trace playwright-report/data/<trace-file>.zip
```
The trace viewer shows a timeline of every action, screenshot, network request, and console log.

---

## 8. CI/CD Integration

Add to `.github/workflows/e2e.yml`:

```yaml
name: E2E Tests

on:
  push:
    branches: [main]
  pull_request:

jobs:
  e2e:
    runs-on: ubuntu-latest
    timeout-minutes: 30

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: "npm"

      - name: Install root dependencies
        run: npm ci

      - name: Install frontend dependencies
        run: npm ci
        working-directory: frontend

      - name: Install Playwright browsers
        run: npx playwright install --with-deps

      - name: Run E2E tests (mocked backend)
        run: |
          SKIP_LIVE_API_TESTS=true npx playwright test
        env:
          CI: true

      - name: Upload Playwright Report
        uses: actions/upload-artifact@v4
        if: always()
        with:
          name: playwright-report
          path: playwright-report/
          retention-days: 30
```

For PRs that should also run live API tests:

```yaml
      - name: Run live API contract tests
        if: github.ref == 'refs/heads/main'
        run: npx playwright test 19-api-contract
        env:
          PLAYWRIGHT_API_URL: ${{ secrets.RENDER_API_URL }}
          SKIP_WEBSERVER: true
          CI: true
```

---

## 9. Mock vs Live Backend

Most tests use Playwright's `page.route()` to intercept HTTP calls and return fixture data. This means:

- No backend server is required
- Tests run in milliseconds (no real LLM calls)
- Results are deterministic

The mock architecture uses two files:
- `e2e/fixtures/test-data.ts` — mock response shapes (QueryResponse, ChunkResponse, HealthResponse)
- `e2e/fixtures/api-mock.ts` — `page.route()` helpers that intercept the API URL

**Important:** Route mocks must be registered BEFORE `page.goto()`. All `beforeEach` hooks call `mockHealthOk(page)` (or similar) before navigating.

### Live backend tests (19-api-contract.spec.ts)

These tests use Playwright's `request.newContext()` to make real HTTP calls. They are skipped by default (`SKIP_LIVE_API_TESTS=true`). Set `SKIP_LIVE_API_TESTS=false` and provide `PLAYWRIGHT_API_URL` to run them.

Individual test timeouts are set to 70 seconds for hybrid queries that involve LLM synthesis.

---

## 10. Test Data Management

### Fixtures

| File | Purpose |
|---|---|
| `e2e/fixtures/test-data.ts` | Full mock QueryResponse, ChunkResponse, HealthResponse objects |
| `e2e/fixtures/api-mock.ts` | `page.route()` helpers: `mockHealthOk`, `mockQueryResponse`, `mockQueryError500`, `mockQueryTimeout`, `mockChunkResponse`, `mockChunk404`, `mockAllDemoQueries` |
| `e2e/fixtures/page-fixtures.ts` | Domain config constants, nav item definitions, tab definitions, sample queries |

### Isolation

Every test is fully isolated:
- `beforeEach` mocks are registered fresh per test (Playwright clears routes between tests)
- `localStorage` is cleared at the start of domain-specific tests via `page.evaluate(() => localStorage.removeItem(...))`
- No test depends on the state left by another test

### Adding new fixture data

To add a new mock response, add it to `e2e/fixtures/test-data.ts` following the existing pattern, then register a new route helper in `e2e/fixtures/api-mock.ts`.

---

## 11. File Index

### Helpers

| File | Description |
|---|---|
| `e2e/helpers/panels.ts` | `FourPanelPage` — page object for the main `/` page (chat, timeline, graph) |
| `e2e/helpers/assertions.ts` | Custom assertions: badge colours, ARIA, XSS safety, drawer focus trap |
| `e2e/helpers/nav-page.ts` | `NavPage`, `DashboardPage`, `ExamplesPage`, `FaqPage`, `DataPage` — page objects for all secondary pages |

### Fixtures

| File | Description |
|---|---|
| `e2e/fixtures/test-data.ts` | Mock API response fixtures for all three demo queries |
| `e2e/fixtures/api-mock.ts` | Route intercept helpers for backend API calls |
| `e2e/fixtures/page-fixtures.ts` | Static domain/nav/tab constants for reuse across tests |

### Test Files

| File | Coverage |
|---|---|
| `e2e/tests/01-layout.spec.ts` | Main page: panel presence, viewport sizing, React Flow |
| `e2e/tests/02-chat-submit.spec.ts` | Chat: submit flow, loading state, response rendering |
| `e2e/tests/03-agent-timeline.spec.ts` | Agent timeline: step rendering, tool badges, plan text |
| `e2e/tests/04-graph-viewer.spec.ts` | Graph viewer: node count, edge types, zoom controls |
| `e2e/tests/05-citations.spec.ts` | Citations drawer: open/close, confidence badge, highlight |
| `e2e/tests/06-demo-queries.spec.ts` | All three PRD demo queries: end-to-end flow |
| `e2e/tests/07-error-states.spec.ts` | API 500, network timeout, chunk 404, health degraded |
| `e2e/tests/08-edge-cases.spec.ts` | Empty input, XSS, rapid clicks, special characters |
| `e2e/tests/09-accessibility.spec.ts` | ARIA labels, keyboard navigation, focus trap |
| `e2e/tests/10-api-health.spec.ts` | /healthz ok and degraded states visible in UI |
| `e2e/tests/11-navigation.spec.ts` | NAVIGATE dropdown all 7 links, direct URL, back/forward |
| `e2e/tests/12-domain-switcher.spec.ts` | Aircraft ↔ medical: placeholder, disclaimer, graph label, localStorage, dashboard tabs |
| `e2e/tests/13-main-page.spec.ts` | Main page: header, chat panel, warm-up ping, GraphViewer, AgentTimeline, theme toggle |
| `e2e/tests/14-dashboard.spec.ts` | Dashboard: 5 tabs aircraft and medical, domain banner, nav dropdown |
| `e2e/tests/15-examples.spec.ts` | /examples: 14 cards, copy button, accordion expand/collapse, industry section |
| `e2e/tests/16-medical-examples.spec.ts` | /medical-examples: 14 cards, copy, PhD frame sections, specialties |
| `e2e/tests/17-faq.spec.ts` | /faq: aircraft/medical section dividers, accordion, at least 6 sections |
| `e2e/tests/18-data-page.spec.ts` | /data: DS-01…DS-05 labels, schema toggle, copy snippet, Kaggle links |
| `e2e/tests/19-api-contract.spec.ts` | Live backend: GET /healthz shape, POST /query shape, 422 validation, 404 |
| `e2e/tests/20-additional-error-states.spec.ts` | Cold start, CORS fix verification, double-submit guard, medical disclaimer |

---

## 12. Coverage Summary

| Category | Covered |
|---|---|
| All 8 pages/routes | Yes (/, /dashboard, /examples, /medical-examples, /data, /review, /faq, /diagram) |
| Domain switcher (aircraft ↔ medical) | Yes — placeholder, disclaimer, graph label, tab labels, banner, localStorage |
| NAVIGATE dropdown (7 items) | Yes — all items click-tested |
| Browser back/forward | Yes |
| Chat panel: empty state | Yes |
| Chat panel: submit flow | Yes |
| Chat panel: loading state | Yes |
| Chat panel: error state (500) | Yes |
| Chat panel: network timeout | Yes |
| Chat panel: whitespace validation | Yes |
| Submit button: disabled states | Yes |
| Backend warm-up ping (/healthz) | Yes — called on load, status banners |
| CORS fix (no Content-Type on GET) | Yes — header inspection test |
| GraphViewer: React Flow nodes | Yes — node count, entity/chunk types |
| AgentTimeline: step rendering | Yes |
| Citations drawer | Yes — open, close, confidence, highlight, 404 |
| Theme toggle | Yes — dark/light, localStorage, persistence |
| Font size control | Partial (accessible via keyboard, not pixel-level) |
| Dashboard: all 5 tabs clickable | Yes |
| Dashboard: domain banner | Yes |
| Example pages: copy button | Yes — COPIED state and revert |
| Example pages: accordion | Yes |
| FAQ: accordion expand/collapse | Yes |
| Data page: schema toggle | Yes |
| API contract: /healthz shape | Yes |
| API contract: POST /query shape | Yes |
| API contract: validation (422) | Yes |
| API contract: 404 on invalid run | Yes |
| XSS safety | Yes (08-edge-cases) |
| ARIA labels | Yes (09-accessibility) |

---

## 13. Known Flaky Tests and Mitigation

### Backend cold-start (19-api-contract.spec.ts)

**Risk:** Render free-tier backend sleeps after inactivity. The first POST /query can take 60+ seconds.

**Mitigation:**
- Individual test timeout is set to 70 seconds
- `retries: 2` on CI means three attempts total
- Run the API contract tests after the health ping test — by then, the backend may be warm
- Consider a pre-test warm-up step in CI: `curl $PLAYWRIGHT_API_URL/healthz`

### React Flow async layout (04-graph-viewer.spec.ts)

**Risk:** React Flow uses an internal layout algorithm that runs asynchronously after mount. Node positions and counts may briefly show zero.

**Mitigation:**
- All graph node selectors use `waitForSelector('.react-flow__node', { timeout: 10_000 })`
- Never count nodes immediately after `page.goto()` — always wait for the selector first

### Copy-to-clipboard tests (15-examples, 16-medical-examples, 18-data-page)

**Risk:** `page.context().grantPermissions(['clipboard-write'])` may not work on all browser contexts, particularly WebKit.

**Mitigation:**
- Tests use `grantPermissions` before clicking
- WebKit clipboard behaviour differs — if tests fail on WebKit only, skip with `test.skip(browserName === 'webkit', ...)`
- The COPIED visual state is asserted (text change), not the actual clipboard contents

### Domain switcher timing (12-domain-switcher.spec.ts)

**Risk:** The `setDomain()` call writes to localStorage and updates React state. There's a brief window where the UI may not yet reflect the new domain.

**Mitigation:**
- All domain switch assertions use `{ timeout: 5_000 }` to allow for state propagation
- A `waitForTimeout(150)` settle delay is used in the `NavPage.setDomain()` helper

### localhost:3005 port conflict

**Risk:** If another process is using port 3005, the dev server fails to start.

**Mitigation:**
- The `playwright.config.ts` uses `reuseExistingServer: !process.env.CI` — locally, it reuses a running server
- In CI, always start fresh: `SKIP_WEBSERVER=false`

---

## 14. Adding New Tests

### Adding a test for a new page

1. Create `e2e/tests/NN-page-name.spec.ts`
2. Add a Page Object to `e2e/helpers/nav-page.ts` if the page has non-trivial interactions
3. Add any static data constants to `e2e/fixtures/page-fixtures.ts`
4. Follow the naming convention: `describe("[Page] — [Context]"` / `test("verb + observable outcome")`

### Adding a new API mock

1. Add the fixture object to `e2e/fixtures/test-data.ts`
2. Add a route helper to `e2e/fixtures/api-mock.ts`:
   ```typescript
   export async function mockMyEndpoint(page: Page): Promise<void> {
     await page.route(`${API_URL}/my-endpoint`, async (route) => {
       await route.fulfill({
         status: 200,
         contentType: "application/json",
         body: JSON.stringify(MY_FIXTURE),
       });
     });
   }
   ```
3. Call it in `beforeEach` before `page.goto()`

### Selector priority

1. `getByRole()` — semantic, most resilient
2. `getByText()` — content-based, good for labels
3. `getByTitle()` — for icon buttons with title attributes
4. `locator("[class*='...']")` — CSS class partial match, use when no semantic option exists
5. `data-testid` — add to components as a last resort and document the addition

### Common pitfalls

- **Never use `page.waitForTimeout()`** for anything longer than 300ms. Use `waitForSelector`, `waitForResponse`, or `expect().toBeVisible({ timeout })` instead.
- **Register route mocks before `page.goto()`** — Playwright only intercepts from the point of registration.
- **LocalStorage state leaks** between tests if not cleared — always explicitly set or remove `nextai_domain` and `theme` in `beforeEach` when testing domain/theme behaviour.

---

## 15. Bug Report

### Analysis conducted: 2026-03-05

The following was checked against the actual codebase:

#### Confirmed bug from task description — `disease_cases` table

**Status: NOT FOUND in current code.**

After searching all Python files in `backend/`, the `disease_cases` table name does not appear anywhere. The SQL tool (`backend/app/tools/sql_tool.py`) uses:
- `disease_records` — for the `disease_counts_by_specialty`, `disease_severity_distribution`, and `disease_symptom_profile` named queries
- `medical_cases` — for the `medical_system_summary` named query

Both `disease_records` and `medical_cases` are real tables confirmed in:
- `backend/app/db/models.py` (lines 217, 271)
- `backend/app/db/migrations/versions/0002_medical_domain.py`

The bug may have existed in an earlier version and was already fixed, or may only manifest when the LLM agent generates ad-hoc SQL queries that incorrectly reference `disease_cases`. The `medical_system_summary` named query uses `medical_cases` correctly.

**Recommendation:** Add a test in `19-api-contract.spec.ts` (live mode) that submits a medical SQL-intent query and verifies no `UndefinedTable` error appears in the response.

#### Confirmed bug: Existing test helpers use wrong selectors

**Status: ACTIVE.**

`e2e/helpers/panels.ts` uses `getByRole("heading", { name: "Chat", exact: true })` but the main page renders:
```html
<span class="panel-hdr-title">COMMS // QUERY INTERFACE</span>
```
— not a heading element with "Chat". Tests in `01-layout.spec.ts` through `10-api-health.spec.ts` that use `FourPanelPage` with `assertAllPanelsVisible()` are likely failing in the current codebase.

**Fix:** Update `panels.ts` to use correct selectors. The new test files (11–20) were written with the correct selectors from the actual markup.

**Recommended `panels.ts` fix:**
```typescript
// OLD (broken):
this.chatPanel = page.locator("main").filter({ has: page.getByRole("heading", { name: "Chat", exact: true }) });

// NEW (correct):
this.chatPanel = page.locator(".panel-chat, .panel").filter({ hasText: /COMMS.*QUERY INTERFACE/ });

// And assertAllPanelsVisible():
async assertAllPanelsVisible(): Promise<void> {
  await expect(page.getByText(/COMMS.*QUERY INTERFACE|QUERY INTERFACE/i).first()).toBeVisible();
  await expect(page.getByText(/AGENT EXECUTION TRACE/i)).toBeVisible();
  await expect(page.getByText(/KNOWLEDGE GRAPH/i).first()).toBeVisible();
}
```

#### CORS fix verified in code

`api.ts` correctly omits `Content-Type` on GET/HEAD requests:
```typescript
const baseHeaders: Record<string, string> =
  method !== "GET" && method !== "HEAD"
    ? { "Content-Type": "application/json" }
    : {};
```
Test `20-additional-error-states.spec.ts` verifies this by capturing request headers on the `/healthz` route intercept.

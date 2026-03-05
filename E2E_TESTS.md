# E2E Test Suite Documentation — NextAgentAI

**Version:** 1.0
**Date:** 2026-03-04
**Framework:** Playwright (TypeScript)
**Browsers:** Chromium (primary), Firefox, WebKit

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

---

## 1. Prerequisites

| Requirement | Version | Notes |
|---|---|---|
| Node.js | 20+ | Required by Next.js 15 and Playwright |
| npm | 10+ | Used for installing Playwright |
| Frontend dev server | running on port 3000 | `npm run dev` in `frontend/` |
| Backend (optional) | running on port 8000 | Only needed for live-backend tests |
| Docker (optional) | any | For full-stack local dev via `docker compose up` |

The test suite is designed to run **entirely with a mocked backend** — you do NOT need a live database, Kaggle credentials, or an Anthropic API key to run any of the 10 test files. The mock responses in `e2e/fixtures/test-data.ts` simulate all three PRD demo queries accurately.

---

## 2. Installation and Setup

All Playwright dependencies are installed at the **repo root level** (not inside `frontend/`). This keeps the e2e tooling separate from the Next.js production bundle.

```bash
# 1. Navigate to the repo root
cd C:/Users/Bruce/source/repos/NextAgentAI

# 2. Install Playwright and its test runner
npm install --save-dev @playwright/test

# 3. Install the browser binaries (Chromium, Firefox, WebKit)
npx playwright install

# 4. Install system dependencies for the browsers (Linux/CI only)
npx playwright install-deps
```

Create a `package.json` at the repo root if one does not exist (or add these scripts to an existing one):

```json
{
  "scripts": {
    "test:e2e": "playwright test",
    "test:e2e:ui": "playwright test --ui",
    "test:e2e:headed": "playwright test --headed",
    "test:e2e:report": "playwright show-report"
  },
  "devDependencies": {
    "@playwright/test": "^1.49.0",
    "typescript": "5.7.3"
  }
}
```

**TypeScript configuration:** The `playwright.config.ts` and all test files are TypeScript. Playwright uses its own built-in TypeScript transpilation — no separate `tsconfig.json` is required at the repo root (though you may add one pointing to `frontend/tsconfig.json` if you want type-checking for the fixtures).

---

## 3. Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PLAYWRIGHT_BASE_URL` | `http://localhost:3000` | Frontend URL that tests navigate to |
| `PLAYWRIGHT_API_URL` | `http://localhost:8000` | Backend API URL used for route intercepts |
| `CI` | _(unset)_ | Set by GitHub Actions; enables 2 retries and HTML reporter |
| `SKIP_WEBSERVER` | _(unset)_ | Set to `true` to skip the auto-started dev server |

For local development, the defaults work without any `.env` file. For CI or deployment testing, set these as environment variables or secrets.

---

## 4. Running the Full Suite

```bash
# From the repo root — starts the Next.js dev server automatically
npx playwright test

# Or using the npm script (if package.json scripts are configured)
npm run test:e2e
```

The `webServer` block in `playwright.config.ts` starts `npm run dev` inside `frontend/` automatically before the tests begin, and shuts it down when they complete.

To run tests against an already-running frontend server (faster for iterative development):

```bash
SKIP_WEBSERVER=true npx playwright test
```

---

## 5. Running Specific Tests

### Run a single test file

```bash
npx playwright test e2e/tests/01-layout.spec.ts
npx playwright test e2e/tests/06-demo-queries.spec.ts
```

### Run a single test by name (grep)

```bash
npx playwright test --grep "renders the Chat panel heading"
npx playwright test --grep "Demo Query 3"
```

### Run a test group (describe block)

```bash
npx playwright test --grep "Agent Timeline"
npx playwright test --grep "Citations — drawer opens and closes"
```

### Run in headed mode (see the browser)

```bash
npx playwright test --headed
npx playwright test e2e/tests/04-graph-viewer.spec.ts --headed
```

### Run in UI mode (interactive test explorer)

```bash
npx playwright test --ui
```

### Run on a specific browser only

```bash
npx playwright test --project=chromium
npx playwright test --project=firefox
npx playwright test --project=webkit
```

### Debug a single test

```bash
npx playwright test --debug e2e/tests/05-citations.spec.ts --grep "clicking \[1\] opens"
```

---

## 6. Running Against the Live Deployment

To run the full suite against the production Vercel frontend talking to the Render backend:

```bash
PLAYWRIGHT_BASE_URL=https://next-agent-ai.vercel.app \
PLAYWRIGHT_API_URL=https://nextai-backend.onrender.com \
SKIP_WEBSERVER=true \
npx playwright test
```

**Important notes for live-backend testing:**

- All 10 test files use Playwright route interception (mocks). When `PLAYWRIGHT_API_URL` points to the live Render backend, the mock routes shadow the real API at the same URL pattern. This means even against a live deployment, the tests run with mocked data.
- To test the **actual live API** end-to-end (no mocks), you would need to remove or skip the `page.route()` calls. This is intentional — demo queries against a live LLM are non-deterministic and 10-30s latency makes them unsuitable for a regression suite.
- See [Mock vs Live Backend](#9-mock-vs-live-backend) for guidance on when to use each approach.
- The Render free tier cold-starts after 15 minutes of inactivity. If running against live Render, increase `timeout` in `playwright.config.ts` to `90_000` and `navigationTimeout` to `60_000`.

---

## 7. Interpreting the HTML Report

After any test run, the HTML report is saved to `playwright-report/`. Open it with:

```bash
npx playwright show-report
# or
npm run test:e2e:report
```

### Report structure

| Section | Meaning |
|---|---|
| Green (passed) | Test completed successfully across all browser projects |
| Red (failed) | At least one browser/assertion failed; click for details |
| Yellow (flaky) | Test failed then passed on retry — investigate the root cause |
| Screenshot tab | Full-page screenshot captured at the moment of failure |
| Video tab | Screen recording replayed from the first retry |
| Trace tab | Interactive Playwright trace — step-by-step network, DOM, and action log |

### Using the Trace Viewer

When a test fails after a retry, a `trace.zip` is attached. Open it directly:

```bash
npx playwright show-trace playwright-report/data/<hash>/trace.zip
```

The trace viewer shows:
- Every `page.goto`, `fill`, `click`, `waitFor` call with timestamps
- Screenshots at each step
- Network requests with request/response bodies (useful for mock validation)
- Console logs and JavaScript errors

---

## 8. CI/CD Integration

### GitHub Actions — example workflow

```yaml
# .github/workflows/e2e.yml
name: E2E Tests

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  e2e:
    runs-on: ubuntu-latest
    timeout-minutes: 30

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      # Install root-level Playwright dependencies
      - name: Install root dependencies
        run: npm install

      # Install browser binaries
      - name: Install Playwright browsers
        run: npx playwright install --with-deps

      # Install frontend dependencies (needed for the dev server)
      - name: Install frontend dependencies
        working-directory: frontend
        run: npm install

      # Run E2E tests (webServer starts the frontend automatically)
      - name: Run E2E tests
        run: npx playwright test
        env:
          CI: true
          PLAYWRIGHT_BASE_URL: http://localhost:3000
          PLAYWRIGHT_API_URL: http://localhost:8000

      # Upload artifacts on failure
      - name: Upload test report
        uses: actions/upload-artifact@v4
        if: always()
        with:
          name: playwright-report
          path: playwright-report/
          retention-days: 7

      - name: Upload traces on failure
        uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: playwright-traces
          path: test-results/
          retention-days: 7
```

### CI best practices for this project

- Run only the Chromium project in CI for speed; add Firefox and WebKit as a scheduled nightly job.
- Set `workers: 2` in `playwright.config.ts` for CI (already configured when `CI=true`).
- Cache the Playwright browser binaries using `~/.cache/ms-playwright` in the GitHub Actions cache.
- The `SKIP_WEBSERVER` env var is NOT set in CI — let Playwright manage the dev server lifecycle.

---

## 9. Mock vs Live Backend

### When to use the mocked backend (default)

All 10 test files use Playwright route interception (`page.route()`) to mock:
- `POST /query` — returns a deterministic `QueryResponse` fixture
- `GET /docs/{id}/chunks/{id}` — returns a deterministic `ChunkResponse` fixture
- `GET /healthz` — returns `{ status: "ok" }` or `{ status: "degraded" }`

**Use mocked mode for:**
- All automated CI regression testing
- Frontend behaviour (loading states, error handling, drawer interactions)
- Performance and flakiness — no LLM latency, no cold starts
- Offline development (no database or API key needed)

### When to use the live backend

Run against the live backend when you want to verify:
- The actual LLM answer quality and content for the three demo queries
- Real vector search scores and graph path shapes
- End-to-end latency from the Render deployment
- Backend changes haven't broken the API contract (schema alignment)

To run without mocks, create a separate smoke test file (e.g., `e2e/tests/99-live-smoke.spec.ts`) that does NOT call `page.route()` and set realistic timeouts. Do not include this file in the standard CI run.

```bash
# Run live smoke tests only (no mocks, requires live backend)
PLAYWRIGHT_BASE_URL=https://next-agent-ai.vercel.app \
PLAYWRIGHT_API_URL=https://nextai-backend.onrender.com \
SKIP_WEBSERVER=true \
npx playwright test e2e/tests/99-live-smoke.spec.ts --timeout=90000
```

---

## 10. Test Data Management

### Mock fixture files

All mock response data is centralised in two files:

| File | Purpose |
|---|---|
| `e2e/fixtures/test-data.ts` | All `QueryResponse`, `ChunkResponse`, and `HealthResponse` fixtures |
| `e2e/fixtures/api-mock.ts` | Route intercept helper functions that wrap `page.route()` |

The fixtures exactly match the TypeScript interfaces from `BACKEND.md` / `frontend/app/lib/api.ts`. If the backend schema changes, update these fixtures and the TypeScript type errors will surface immediately.

### Shared IDs

The following IDs are exported from `test-data.ts` and used consistently across all fixtures:

| Export | Value | Used in |
|---|---|---|
| `CHUNK_ID_HYDRAULIC` | `embed-hydraulic-001` | Query 1 citation, chunk fetch |
| `INCIDENT_ID_HYDRAULIC` | `INC-A1B2C3D4` | Query 1 citation, chunk fetch |
| `CHUNK_ID_DEFECT_TREND` | `embed-defect-trend-001` | Query 2 citation, chunk fetch |
| `INCIDENT_ID_DEFECT_TREND` | `INC-D5E6F7A8` | Query 2 citation, chunk fetch |
| `CHUNK_ID_HYBRID` | `embed-hybrid-001` | Query 3 citation, chunk fetch |
| `INCIDENT_ID_HYBRID` | `INC-H9I0J1K2` | Query 3 citation, chunk fetch |

### Adding new test data

1. Add new `QueryResponse` or `ChunkResponse` objects to `e2e/fixtures/test-data.ts`
2. Export new mock helpers from `e2e/fixtures/api-mock.ts`
3. Reference them in your test file — no other files need changing

---

## 11. File Index

```
e2e/
  fixtures/
    test-data.ts          # All mock response fixtures (QueryResponse, ChunkResponse, HealthResponse)
    api-mock.ts           # page.route() helpers for mocking API endpoints
  helpers/
    panels.ts             # FourPanelPage page object — all panel interactions
    assertions.ts         # Custom assertion helpers (badge colour, XSS, ARIA, focus trap)
  tests/
    01-layout.spec.ts     # Initial page load, panel visibility, viewport fill
    02-chat-submit.spec.ts # Query submission: input, loading, answer, history
    03-agent-timeline.spec.ts # Timeline: empty state, steps, badges, errors, plan text
    04-graph-viewer.spec.ts   # Graph: empty state, nodes, edges, colours, zoom, popover
    05-citations.spec.ts  # Citations: inline links, drawer, highlight, badges, conflict
    06-demo-queries.spec.ts   # All 3 PRD demo queries end-to-end (mocked)
    07-error-states.spec.ts   # API 500, 400 prevention, timeout, 404 chunk, degraded health
    08-edge-cases.spec.ts # Empty query, long query, XSS, special chars, rapid submit, refresh
    09-accessibility.spec.ts  # ARIA labels, keyboard nav, focus trap, heading hierarchy
    10-api-health.spec.ts # healthz ok/degraded states, response shape

playwright.config.ts       # Root-level Playwright configuration
E2E_TESTS.md               # This file
```

---

## 12. Coverage Summary

### Screens and panels covered

| Panel | Covered in | Notes |
|---|---|---|
| Chat panel | 01, 02, 06, 07, 08, 09 | Full CRUD: input, submit, history, errors |
| Agent Timeline | 01, 03, 06 | Empty state, steps, badges, errors |
| Graph Viewer | 01, 04, 06 | Empty state, nodes, edges, zoom, popover |
| Citations Drawer | 05, 06, 07, 08, 09 | Open/close, highlight, badges, error, a11y |

### PRD acceptance criteria covered

| AC | Description | Covered By |
|---|---|---|
| F7-AC1 | Chat panel — submit query, answer rendered | 02-chat-submit |
| F7-AC2 | Agent timeline — show each step | 03-agent-timeline |
| F7-AC3 | Graph viewer — React Flow renders graph_path | 04-graph-viewer |
| F7-AC4 | Citations drawer — highlighted source span | 05-citations |
| F4-AC1 | Intent classified correctly | 03, 06 (intent badge) |
| F4-AC4 | Each claim has citation + confidence | 05-citations |
| PRD-SM3 | UI renders graph path | 04-graph-viewer |
| Demo Q1 | Vector-only: hydraulic actuator crack | 06-demo-queries |
| Demo Q2 | SQL-only: defect trends | 06-demo-queries |
| Demo Q3 | Hybrid: avionics connector classify | 06-demo-queries |

### What is NOT covered by this suite

| Gap | Reason |
|---|---|
| `POST /ingest` trigger and polling | No UI for this in the current frontend |
| `GET /docs` document list | Not used in the frontend (library function only) |
| Real LLM answer quality | Non-deterministic; requires live backend smoke tests |
| Docker Compose stack health | Requires Docker; out of scope for frontend e2e |
| Vector search latency < 500ms | Performance test; requires live DB with 10k rows |
| End-to-end ingest pipeline | Backend integration test, not frontend e2e |

---

## 13. Known Flaky Tests and Mitigation

### Graph node count timing

**Test:** `04-graph-viewer.spec.ts — renders the correct number of nodes`

**Cause:** React Flow's `useEffect` triggers layout computation asynchronously after the RunContext is updated. On slow CI machines, the nodes may not be in the DOM when the assertion runs.

**Mitigation:** The test uses `page.waitForSelector('.react-flow__node', { timeout: 10_000 })` before counting. If still flaky, increase the timeout or add `await page.waitForFunction(() => document.querySelectorAll('.react-flow__node').length >= 4)`.

---

### Loading skeleton visibility

**Test:** `02-chat-submit.spec.ts — loading skeleton appears while request is in-flight`

**Cause:** With a very fast mock (no artificial delay), the skeleton may render and disappear faster than Playwright's screenshot interval. The test uses a 200ms mock delay specifically to ensure the skeleton is visible long enough to assert.

**Mitigation:** The 200ms delay in the mock is intentional. Do not reduce it below 150ms.

---

### Popover closing timing (Graph Viewer)

**Test:** `04-graph-viewer.spec.ts — node popover closes when clicking outside`

**Cause:** Radix UI Popover uses a `pointerdown` event listener for outside click detection. Playwright's `mouse.click()` at coordinates may not always trigger the pointerdown before the pointerup, depending on the platform.

**Mitigation:** Use `page.mouse.move(50, 50)` followed by `page.mouse.down()` and `page.mouse.up()` if `mouse.click()` proves unreliable. Alternatively, press `Escape` to close the popover reliably.

---

### Citations drawer focus trap on WebKit

**Test:** `09-accessibility.spec.ts — focus is trapped inside the drawer`

**Cause:** WebKit's focus management for `role="dialog"` elements differs slightly from Chromium and Firefox. Radix UI's Sheet component uses `@radix-ui/react-focus-scope` which is typically cross-browser, but WebKit may require an additional frame to establish focus.

**Mitigation:** Add a small `await page.waitForTimeout(100)` after opening the drawer in WebKit-only contexts if the test fails. The test currently includes a `waitForDrawerOpen()` helper which should provide enough settling time.

---

### `waitForAnswer()` timeout on slow CI

**Test:** Multiple chat submission tests

**Cause:** The `waitForAnswer()` helper waits for `.justify-start .bg-card` to be visible. On slow CI, the React state update and re-render can exceed the default 5s assertion timeout.

**Mitigation:** `waitForAnswer()` uses `{ timeout: 30_000 }` which should be sufficient. If CI is particularly slow, increase the global `expect.timeout` in `playwright.config.ts` to `15_000`.

---

## 14. Adding New Tests

### Step 1: Understand the component

Read the relevant component source in `frontend/app/components/` to understand what DOM elements are rendered and what state drives them.

### Step 2: Create or extend a mock fixture

If your new test needs a different API response shape, add a new fixture object to `e2e/fixtures/test-data.ts` and a corresponding helper to `e2e/fixtures/api-mock.ts`.

### Step 3: Add page object methods if needed

If your test requires interacting with a new UI pattern that isn't yet covered by `FourPanelPage`, add a method to `e2e/helpers/panels.ts`. Follow the dual selector strategy: try `aria-label` or `role` first, then Tailwind class names.

### Step 4: Write the test

```typescript
// e2e/tests/11-my-feature.spec.ts
import { test, expect } from "@playwright/test";
import { FourPanelPage } from "../helpers/panels";
import { mockQueryResponse, mockHealthOk, MOCK_RESPONSE_QUERY_1 } from "../fixtures/api-mock";

test.describe("My Feature — context description", () => {
  test.beforeEach(async ({ page }) => {
    await mockHealthOk(page);
    await mockQueryResponse(page, MOCK_RESPONSE_QUERY_1);
  });

  test("describes the observable outcome as a verb phrase", async ({ page }) => {
    const panelPage = new FourPanelPage(page);
    await panelPage.navigate();
    // ... test body
  });
});
```

### Naming conventions

- File: `NN-feature-name.spec.ts` (zero-padded two-digit prefix for ordering)
- Describe: `[Component/Feature] — [Context]`
- Test names: start with a verb (`shows`, `renders`, `opens`, `prevents`, `navigates`)

### Selector strategy

Priority order:
1. `getByRole()` — most resilient to HTML changes
2. `getByPlaceholder()`, `getByLabel()`, `getByText()` — semantic
3. `aria-label` attribute selectors — `page.getByRole("button", { name: ... })`
4. Tailwind class names (`.bg-blue-100`) — use only when no semantic selector exists
5. `data-testid` — add these to components when all else fails; document the addition

### Data-testid recommendations

The following elements currently lack `data-testid` attributes and rely on class/role selectors. Adding these would make the tests more robust:

| Element | Recommended data-testid | Component |
|---|---|---|
| Chat message scroll area | `chat-message-list` | `ChatPanel.tsx` |
| Individual user message | `chat-message-user` | `ChatPanel.tsx` |
| Individual assistant message | `chat-message-assistant` | `ChatPanel.tsx` |
| Timeline step row | `timeline-step-{n}` | `AgentTimeline.tsx` |
| Timeline empty state | `timeline-empty` | `AgentTimeline.tsx` |
| Graph empty state | `graph-empty` | `GraphViewer.tsx` |
| Citation drawer content | `citation-drawer-content` | `CitationsDrawer.tsx` |
| Confidence badge | `confidence-badge` | `CitationsDrawer.tsx` |
| Highlighted citation span | `citation-highlight` (class already present) | `CitationsDrawer.tsx` |

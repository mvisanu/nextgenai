# tasks3.md — NextAgentAI Wave 4: Supabase Auth

> Generated from: `auth_prompt.md` + `prd3.md`
> Generated on: 2026-03-08
> Total tasks: 28

---

## Summary

| Phase | Name | Tasks | Earliest Start |
|---|---|---|---|
| 1 | Backend Auth Infrastructure | W4-001 → W4-009 | Immediately (no frontend dependency) |
| 2 | Frontend Auth Infrastructure | W4-010 → W4-015 | Immediately (parallel with Phase 1) |
| 3 | Auth Pages | W4-016 → W4-019 | After W4-013 (AuthProvider) |
| 4 | AppHeader + API Client Integration | W4-020 → W4-025 | After W4-013, W4-014, W4-015 |
| 5 | Environment, Deployment & Docs | W4-026 → W4-028 | After all Phase 4 tasks |

---

## Parallel Work Waves

**Wave 1 (no blockers):**
W4-001, W4-010

**Wave 2:**
W4-002 (after W4-001), W4-011 (after W4-010)

**Wave 3:**
W4-003, W4-004 (after W4-002); W4-012, W4-013 (after W4-011)

**Wave 4:**
W4-005 (after W4-003, W4-004); W4-014 (after W4-013); W4-015 (after W4-013)

**Wave 5:**
W4-006 (after W4-005); W4-016, W4-017, W4-018, W4-019 (after W4-014, W4-015)

**Wave 6:**
W4-007 (after W4-006); W4-020 (after W4-013); W4-021 (after W4-013, W4-015)

**Wave 7:**
W4-008 (after W4-007); W4-022 (after W4-021); W4-023 (after W4-021); W4-024 (after W4-021); W4-025 (after W4-022, W4-023, W4-024)

**Wave 8:**
W4-009 (after W4-008); W4-026, W4-027 (after W4-008, W4-025)

**Wave 9:**
W4-028 (after W4-026, W4-027)

---

## Dependency Graph Summary

```
Phase 1 (Backend)           Phase 2 (Frontend Infra)
    |                               |
    W4-001                       W4-010
    W4-002                       W4-011
    W4-003, W4-004               W4-012, W4-013
    W4-005                       W4-014, W4-015
    W4-006                            |
    W4-007               Phase 3 (Auth Pages)
    W4-008               W4-016, W4-017, W4-018, W4-019
    W4-009                            |
         \               Phase 4 (Integration)
          \              W4-020, W4-021
           \             W4-022, W4-023, W4-024, W4-025
            \                         |
             +----> Phase 5 (Env & Deploy)
                    W4-026, W4-027, W4-028
```

Phases 1 and 2 are fully independent and may be implemented in parallel. Phase 3 requires the `AuthProvider` and Supabase browser client (W4-013, W4-014). Phase 4 requires `AuthContext` + `apiFetch` + middleware. Phase 5 requires all code tasks complete.

---

## Key Constraints (from CLAUDE.md and prd3.md)

- **No `asyncio.get_event_loop()`** — any changes to `orchestrator.py` must use `asyncio.get_running_loop()` (CR-007). Verify with `grep -r "get_event_loop" backend/app/`.
- **`@supabase/ssr` only** — `@supabase/auth-helpers-nextjs` is deprecated and must not be used.
- **`tsc --noEmit` must pass** — run `npx tsc --noEmit` from `frontend/` before declaring Phase 4 complete.
- **525 existing tests must not regress** — run `backend/.venv/Scripts/python -m pytest tests/` after every backend change; target: 525+ passed, 5 skipped.
- **Alembic CONCURRENTLY pattern** — `op.execute("COMMIT")` must precede every `CREATE INDEX CONCURRENTLY`. Follow `0005_wave3_indexes.py` exactly.
- **AppHeader: additive only** — no second `DomainSwitcher`, `NavDropdown`, or logo. Auth additions go to the right side only.
- **Dashboard height unchanged** — `height: calc(100vh - 46px)` on dashboard outer div; do not alter.
- **`ORJSONResponse` default** — auth error responses from FastAPI use `ORJSONResponse` automatically; no special handling needed.
- **Open redirect protection** — `?next=` param must be validated: starts with `/`, does not contain `://`, does not start with `//`.
- **No new UI libraries** — all auth page styling uses existing Tailwind + inline SCADA CSS vars (no component library additions).
- **`SUPABASE_JWT_SECRET` stays backend-only** — never in `NEXT_PUBLIC_` env vars or frontend code.
- **Test runner** — always `backend/.venv/Scripts/python -m pytest tests/` from `backend/`; bare `pytest` will fail.

---

## Tasks

---

### W4-001: Add `python-jose[cryptography]` to backend requirements

**Phase**: 1 — Backend Auth Infrastructure
**Depends on**: none
**Files**:
- `backend/requirements.txt` — modify

**Acceptance criteria**:
- [ ] `python-jose[cryptography]>=3.3.0` is present in `backend/requirements.txt`.
- [ ] No duplicate or conflicting `jose` entries in the file.
- [ ] `pip install -r requirements.txt` completes without error in the backend venv.

**Key constraints**: Do not add any other new Python packages not required by auth.

---

### W4-002: Create `backend/app/auth/` package skeleton

**Phase**: 1 — Backend Auth Infrastructure
**Depends on**: W4-001
**Files**:
- `backend/app/auth/__init__.py` — create (empty or minimal exports)

**Acceptance criteria**:
- [ ] `backend/app/auth/__init__.py` exists.
- [ ] `from backend.app.auth import jwt` imports without error inside the venv.
- [ ] No circular imports introduced (verify by importing `main.py` in a dry run).

**Key constraints**: The `__init__.py` may be empty; the actual logic lives in `jwt.py` (W4-003).

---

### W4-003: Implement `backend/app/auth/jwt.py` — JWT verification

**Phase**: 1 — Backend Auth Infrastructure
**Depends on**: W4-002
**Files**:
- `backend/app/auth/jwt.py` — create

**Acceptance criteria**:
- [ ] `verify_token(token: str) -> dict` decodes a valid Supabase HS256 JWT using `SUPABASE_JWT_SECRET` from `os.environ` and returns the claims dict.
- [ ] `verify_token` raises `HTTPException(status_code=401)` for: expired token, wrong signature, missing `sub` claim, malformed token.
- [ ] `get_current_user(request: Request) -> dict` extracts the `Authorization: Bearer <token>` header, calls `verify_token`, returns claims. Raises `HTTPException(401)` if the header is absent.
- [ ] `SUPABASE_JWT_SECRET` is never logged or included in exception detail strings.
- [ ] Module imports cleanly: `from backend.app.auth.jwt import get_current_user`.

**Key constraints**: Algorithm must be `HS256`. Use `jose.jwt.decode()` from `python-jose`. Do not call the Supabase API on each request.

---

### W4-004: Add `user_id` column to `AgentRun` ORM model

**Phase**: 1 — Backend Auth Infrastructure
**Depends on**: W4-002
**Files**:
- `backend/app/db/models.py` — modify

**Acceptance criteria**:
- [ ] `AgentRun` ORM class has `user_id = Column(PGUUID(as_uuid=True), nullable=True, index=True)`.
- [ ] Import `from sqlalchemy.dialects.postgresql import UUID as PGUUID` is present (or reuses the existing import if already present).
- [ ] `nullable=True` — existing rows are unaffected.
- [ ] Existing tests that construct `AgentRun` objects do not fail (`pytest tests/` passes).

**Key constraints**: Do not change any other columns. `PGUUID(as_uuid=True)` must match the migration type used in W4-005.

---

### W4-005: Write Alembic migration `0006_add_user_id_to_agent_runs.py`

**Phase**: 1 — Backend Auth Infrastructure
**Depends on**: W4-003, W4-004
**Files**:
- `backend/app/db/migrations/versions/0006_add_user_id_to_agent_runs.py` — create

**Acceptance criteria**:
- [ ] `revision = "0006_add_user_id"`, `down_revision = "0005_wave3_indexes"`.
- [ ] `upgrade()` adds `user_id UUID NULLABLE` column to `agent_runs` via `op.add_column`.
- [ ] `upgrade()` calls `op.execute("COMMIT")` immediately before `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_agent_runs_user_id ON agent_runs (user_id, created_at DESC)`.
- [ ] `downgrade()` drops the index with `DROP INDEX IF EXISTS` then drops the column.
- [ ] Migration file follows the exact structure and comment style of `0005_wave3_indexes.py`.
- [ ] `alembic history` shows the new revision in the chain (local Docker DB).

**Key constraints**: The CONCURRENTLY pattern is mandatory — see `0005_wave3_indexes.py`. Do not skip `op.execute("COMMIT")` or Neon will error. `downgrade()` must be a working reverse.

---

### W4-006: Thread `user_id` through `orchestrator.run()` and `_save_run()`

**Phase**: 1 — Backend Auth Infrastructure
**Depends on**: W4-005
**Files**:
- `backend/app/agent/orchestrator.py` — modify

**Acceptance criteria**:
- [ ] `orchestrator.run()` signature gains `user_id: str | None = None` as an optional keyword parameter after the existing `conversation_history` param.
- [ ] `_save_run()` (or equivalent internal save method) includes `user_id` in the `agent_runs` INSERT.
- [ ] When `user_id=None`, the INSERT stores `NULL` for `user_id` (preserves backward compatibility).
- [ ] No use of `asyncio.get_event_loop()` — `asyncio.get_running_loop()` only (CR-007). Verify with `grep -r "get_event_loop" backend/app/`.
- [ ] All existing 525 tests continue to pass after the change.

**Key constraints**: The `run()` method is `async`; `_save_run()` must also remain async or sync-in-executor as appropriate. Do not change the return type `AgentRunResult`.

---

### W4-007: Add `Depends(get_current_user)` to protected API routers

**Phase**: 1 — Backend Auth Infrastructure
**Depends on**: W4-006
**Files**:
- `backend/app/api/query.py` — modify
- `backend/app/api/runs.py` — modify
- `backend/app/api/analytics.py` — modify

**Acceptance criteria**:
- [ ] `POST /query`: receives `current_user: dict = Depends(get_current_user)`; extracts `user_id = current_user["sub"]`; passes `user_id` to `orchestrator.run()`.
- [ ] `GET /runs`: receives `Depends(get_current_user)`; adds `WHERE user_id = :user_id` filter so users see only their own runs.
- [ ] `GET /runs/{run_id}`: receives `Depends(get_current_user)`; adds `AND user_id = :user_id` guard; returns HTTP 404 if run belongs to a different user.
- [ ] `PATCH /runs/{run_id}/favourite`: receives `Depends(get_current_user)`; adds `AND user_id = :user_id` guard; returns HTTP 404 for another user's run.
- [ ] `GET /analytics/*`: receives `Depends(get_current_user)`; analytics results are not user-scoped (shared data) but auth is required.
- [ ] `GET /healthz`, `POST /ingest`, `GET /docs` remain public — no `Depends` added.
- [ ] `curl -X POST /query` without an `Authorization` header returns HTTP 401.

**Key constraints**: Import `get_current_user` from `backend.app.auth.jwt`. Do not apply auth globally in `main.py` — apply per-router so public endpoints stay public.

---

### W4-008: Write `backend/tests/test_auth_jwt.py`

**Phase**: 1 — Backend Auth Infrastructure
**Depends on**: W4-007
**Files**:
- `backend/tests/test_auth_jwt.py` — create

**Acceptance criteria**:
- [ ] Test `verify_token` with a validly signed HS256 JWT → returns claims dict with `sub` key.
- [ ] Test `verify_token` with an expired JWT → `HTTPException` with `status_code=401`.
- [ ] Test `verify_token` with a wrong-secret JWT → `HTTPException` with `status_code=401`.
- [ ] Test `get_current_user` with a missing `Authorization` header → `HTTPException` 401.
- [ ] Test `get_current_user` with a malformed `Authorization` header (no "Bearer" prefix) → `HTTPException` 401.
- [ ] All tests run via `backend/.venv/Scripts/python -m pytest tests/test_auth_jwt.py` without requiring a live database.
- [ ] No real `SUPABASE_JWT_SECRET` in test code — use a test secret to sign/verify test tokens.

**Key constraints**: Use the existing Anthropic stub pattern from `conftest.py` as a model for environment patching. Use `python-jose` directly in the test to mint test JWTs.

---

### W4-009: Write `backend/tests/test_wave4_user_id.py` and verify full suite

**Phase**: 1 — Backend Auth Infrastructure
**Depends on**: W4-008
**Files**:
- `backend/tests/test_wave4_user_id.py` — create

**Acceptance criteria**:
- [ ] Tests verify that `orchestrator.run(user_id="some-uuid")` stores `user_id` on the resulting `AgentRunResult` or equivalent output.
- [ ] Tests verify that `orchestrator.run()` with no `user_id` stores `None` without error.
- [ ] Full suite run: `backend/.venv/Scripts/python -m pytest tests/` reports 527+ passed, 5 skipped (original 525 + 2 new test files, net of any skipped).
- [ ] No regressions in any previously passing test.

**Key constraints**: Use mocks/stubs for DB and Anthropic calls — same pattern as existing orchestrator tests.

---

### W4-010: Install `@supabase/supabase-js` and `@supabase/ssr` in frontend

**Phase**: 2 — Frontend Auth Infrastructure
**Depends on**: none
**Files**:
- `frontend/package.json` — modified by npm
- `frontend/package-lock.json` — modified by npm

**Acceptance criteria**:
- [ ] `npm install @supabase/supabase-js @supabase/ssr` completes without error from `frontend/` directory.
- [ ] `@supabase/supabase-js` v2.x appears in `frontend/package.json` `dependencies`.
- [ ] `@supabase/ssr` latest stable appears in `frontend/package.json` `dependencies`.
- [ ] `@supabase/auth-helpers-nextjs` is NOT added (deprecated — not permitted).
- [ ] If peer dependency conflicts arise, `--legacy-peer-deps` may be used; document the flag if used.

**Key constraints**: `@supabase/ssr` only, never `@supabase/auth-helpers-nextjs`. Do not install any form/UI component libraries.

---

### W4-011: Create `frontend/app/lib/supabase.ts` — browser Supabase client

**Phase**: 2 — Frontend Auth Infrastructure
**Depends on**: W4-010
**Files**:
- `frontend/app/lib/supabase.ts` — create

**Acceptance criteria**:
- [ ] Exports a singleton `supabase` via `createBrowserClient(NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY)` from `@supabase/ssr`.
- [ ] Uses `process.env.NEXT_PUBLIC_SUPABASE_URL!` and `process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!` — no hardcoded values.
- [ ] TypeScript: `npx tsc --noEmit` passes with this file present (even if env vars are undefined at build time).
- [ ] File contains no server-only imports (no `next/headers`, no `cookies()`).

**Key constraints**: This file is imported by client components and `auth-context.tsx`. Must be safe to import in `"use client"` context.

---

### W4-012: Create `frontend/app/lib/supabase-server.ts` — server Supabase client factory

**Phase**: 2 — Frontend Auth Infrastructure
**Depends on**: W4-011
**Files**:
- `frontend/app/lib/supabase-server.ts` — create

**Acceptance criteria**:
- [ ] Exports an async `createClient()` factory function using `createServerClient` from `@supabase/ssr`.
- [ ] Uses `cookies()` from `next/headers` with read-only `getAll` access pattern for reading session cookies.
- [ ] Returns a properly typed Supabase client usable in Server Components and Route Handlers.
- [ ] Must not be imported in `"use client"` components — contains server-only APIs.
- [ ] `npx tsc --noEmit` passes.

**Key constraints**: This factory is used by `middleware.ts` (W4-015) with a different cookie pattern (read+write). The server component version is read-only. Do not export a singleton — it must be a factory called per-request.

---

### W4-013: Create `frontend/app/lib/auth-context.tsx` — `AuthProvider` and `useAuth()`

**Phase**: 2 — Frontend Auth Infrastructure
**Depends on**: W4-011
**Files**:
- `frontend/app/lib/auth-context.tsx` — create

**Acceptance criteria**:
- [ ] `"use client"` directive at the top.
- [ ] `AuthContextValue` interface has: `user: User | null`, `accessToken: string | null`, `loading: boolean`, `signOut: () => Promise<void>`. The `User` type is imported from `@supabase/supabase-js` — no `any` casts.
- [ ] `AuthContext` created with `createContext<AuthContextValue | null>(null)`.
- [ ] `AuthProvider` on mount: calls `supabase.auth.getUser()` to populate `user`; sets `loading = false` when complete.
- [ ] `AuthProvider` subscribes to `supabase.auth.onAuthStateChange()` — handles `SIGNED_IN`, `SIGNED_OUT`, `TOKEN_REFRESHED`, `PASSWORD_RECOVERY` events to keep `user` and `accessToken` in sync.
- [ ] `signOut()` calls `supabase.auth.signOut()` then `router.push('/sign-in')`.
- [ ] `useAuth()` hook throws a descriptive error if called outside `AuthProvider`.
- [ ] Structural pattern matches `frontend/app/lib/context.tsx` (`RunContext`) exactly — same file organisation, same `createContext` / `useContext` pattern.
- [ ] `npx tsc --noEmit` passes.

**Key constraints**: `loading = true` guard prevents flash of unauthenticated content during SSR hydration. Import `supabase` singleton from `./supabase` (W4-011), not re-create it.

---

### W4-014: Update `frontend/app/layout.tsx` — add `<AuthProvider>`

**Phase**: 2 — Frontend Auth Infrastructure
**Depends on**: W4-013
**Files**:
- `frontend/app/layout.tsx` — modify

**Acceptance criteria**:
- [ ] `AuthProvider` is imported from `./lib/auth-context`.
- [ ] Provider nesting order (outermost to innermost): `ThemeProvider` → `AuthProvider` → `DomainProvider` → `RunProvider` → `AppHeader` + `{children}`.
- [ ] No other changes to `layout.tsx` — existing `suppressHydrationWarning`, `AppHeader`, and provider structure untouched.
- [ ] Dev server starts without error: `npm run dev` on port 3005.
- [ ] `npx tsc --noEmit` passes.

**Key constraints**: `AuthProvider` must wrap `DomainProvider` and `RunProvider` so `useAuth()` is available everywhere. Do not add a second `<AppHeader />`.

---

### W4-015: Create `frontend/middleware.ts` — session refresh and route protection

**Phase**: 2 — Frontend Auth Infrastructure
**Depends on**: W4-013
**Files**:
- `frontend/middleware.ts` — create (at `frontend/middleware.ts`, NOT inside `app/`)

**Acceptance criteria**:
- [ ] Creates a `createServerClient` instance with full `getAll`/`setAll` cookie access on the request/response pair (read from `request.cookies`, write to `response.cookies`).
- [ ] Calls `await supabase.auth.getUser()` — NOT `getSession()`. This verifies the token and triggers automatic cookie refresh.
- [ ] Protected paths: `/`, `/dashboard`, `/data`, `/review`, `/examples`, `/medical-examples`, `/agent`, `/diagram`, `/faq`.
- [ ] Public paths allowed without auth: `/sign-in`, `/sign-up`, `/forgot-password`, `/reset-password`, and any path under `/(auth)/`.
- [ ] Unauthenticated request to a protected path redirects to `/sign-in?next=<original-path>`.
- [ ] `next` query param validated: value must start with `/` and must not contain `://` or start with `//`. Invalid values default to `/`.
- [ ] `export const config = { matcher: ['/((?!_next/static|_next/image|favicon|api/docs|api/openapi).*)'] }` is present.
- [ ] Visiting `http://localhost:3005/` without a session cookie redirects to `/sign-in?next=/`.
- [ ] `npx tsc --noEmit` passes.

**Key constraints**: `supabase.auth.getUser()` is mandatory (not `getSession()`). Middleware runs on every matched request — keep it fast. The file must be at `frontend/middleware.ts`, not `frontend/app/middleware.ts`.

---

### W4-016: Create `frontend/app/(auth)/sign-in/page.tsx`

**Phase**: 3 — Auth Pages
**Depends on**: W4-014, W4-015
**Files**:
- `frontend/app/(auth)/sign-in/page.tsx` — create

**Acceptance criteria**:
- [ ] `"use client"` directive present.
- [ ] Form fields: Email, Password. Both required.
- [ ] On submit: calls `supabase.auth.signInWithPassword({ email, password })`. Button is disabled and shows a spinner while in-flight.
- [ ] Error mapping: `"Invalid login credentials"` → "Invalid email or password." | `"Email not confirmed"` → "Please confirm your email before signing in." | rate-limit error → "Too many attempts. Please wait before trying again."
- [ ] On success: reads `searchParams.get('next')`; validates the value (starts with `/`, no `://`, no `//`); calls `router.push(validNext ?? '/')`.
- [ ] If `searchParams.get('message') === 'password-updated'`: shows cyan info banner "Your password has been updated."
- [ ] Footer links: "Don't have an account? SIGN UP" → `/sign-up`; "Forgot password?" → `/forgot-password`.
- [ ] Full-height container: `height: calc(100vh - 46px)`, `background: hsl(var(--bg-void))`.
- [ ] Form card: `background: hsl(var(--bg-surface))`, border `hsl(var(--border-base))`, `border-radius: 2px`, `max-width: 420px`, centred.
- [ ] Heading uses Orbitron (`var(--font-display)`), colour `hsl(var(--col-green))`.
- [ ] Error display uses `AlertCircle` (lucide-react), colour `hsl(var(--col-red))`, matches ChatPanel error banner style exactly.
- [ ] `npx tsc --noEmit` passes.

**Key constraints**: No new UI component libraries. Reuse `.panel-hdr`, `.panel-dot` CSS classes from `globals.css`. If `--col-red` is absent from `globals.css`, add it with HSL `0 84% 60%` (see W4-019 for the check). All inline styles match prd3.md § 4.7 spec exactly.

---

### W4-017: Create `frontend/app/(auth)/sign-up/page.tsx`

**Phase**: 3 — Auth Pages
**Depends on**: W4-014, W4-015
**Files**:
- `frontend/app/(auth)/sign-up/page.tsx` — create

**Acceptance criteria**:
- [ ] `"use client"` directive present.
- [ ] Form fields: Email, Password (min 8 chars), Confirm Password. Client-side validation: passwords must match before submit.
- [ ] On submit: calls `supabase.auth.signUp({ email, password, options: { emailRedirectTo: NEXT_PUBLIC_SITE_URL + '/sign-in' } })`. Button disabled + spinner while in-flight.
- [ ] If `data.user && !data.session`: shows cyan message "Check your email for a confirmation link." — no redirect.
- [ ] If `data.session` is present (email confirm disabled): `router.push('/')`.
- [ ] Error: duplicate email → "An account with this email already exists." | weak password → "Password must be at least 8 characters."
- [ ] Footer link: "Already have an account? SIGN IN" → `/sign-in`.
- [ ] Same card/heading/error styling as W4-016.
- [ ] `npx tsc --noEmit` passes.

**Key constraints**: `emailRedirectTo` uses `process.env.NEXT_PUBLIC_SITE_URL` — must never be hardcoded. Confirm Password field is client-side only validation, not sent to Supabase.

---

### W4-018: Create `frontend/app/(auth)/forgot-password/page.tsx`

**Phase**: 3 — Auth Pages
**Depends on**: W4-014, W4-015
**Files**:
- `frontend/app/(auth)/forgot-password/page.tsx` — create

**Acceptance criteria**:
- [ ] `"use client"` directive present.
- [ ] Form field: Email only.
- [ ] On submit: calls `supabase.auth.resetPasswordForEmail(email, { redirectTo: NEXT_PUBLIC_SITE_URL + '/reset-password' })`. Button disabled + spinner while in-flight.
- [ ] On success (regardless of whether the email is registered): shows cyan message "If that email is registered, a reset link has been sent." — no email enumeration.
- [ ] Rate-limit error → "Too many attempts. Please wait."
- [ ] Footer link: back to `/sign-in`.
- [ ] Same card/heading/error styling as W4-016.
- [ ] `npx tsc --noEmit` passes.

**Key constraints**: The success message must always appear after submit — never reveal whether the email exists. `redirectTo` uses `NEXT_PUBLIC_SITE_URL` env var.

---

### W4-019: Create `frontend/app/(auth)/reset-password/page.tsx` and ensure `--col-red` CSS var

**Phase**: 3 — Auth Pages
**Depends on**: W4-014, W4-015
**Files**:
- `frontend/app/(auth)/reset-password/page.tsx` — create
- `frontend/app/globals.css` — modify only if `--col-red` is absent

**Acceptance criteria**:
- [ ] `"use client"` directive present.
- [ ] On mount: subscribes to `supabase.auth.onAuthStateChange`. When event is `PASSWORD_RECOVERY`, enables the new-password form.
- [ ] `createBrowserClient` is initialised before `onAuthStateChange` listener is registered to avoid missed events.
- [ ] Form field: New Password (min 8 chars, validated client-side before submit).
- [ ] On submit: calls `supabase.auth.updateUser({ password: newPassword })`. Button disabled + spinner while in-flight.
- [ ] On success: `router.push('/sign-in?message=password-updated')`.
- [ ] If token is expired or invalid (auth state change event delivers error): shows error "This reset link has expired. Please request a new one." with link to `/forgot-password`.
- [ ] `globals.css` check: if `--col-red` is not defined, add `--col-red: 0 84% 60%;` in the `:root` or `.dark` block consistent with existing colour var style.
- [ ] Same card/heading/error styling as W4-016.
- [ ] `npx tsc --noEmit` passes.

**Key constraints**: `PASSWORD_RECOVERY` event is the gate — the form must be disabled until that event fires. Do not attempt to parse the `#access_token` hash manually; let Supabase JS handle it via the auth state change listener.

---

### W4-020: Update `frontend/app/components/AppHeader.tsx` — user pill and SIGN OUT button

**Phase**: 4 — AppHeader + API Client Integration
**Depends on**: W4-013
**Files**:
- `frontend/app/components/AppHeader.tsx` — modify

**Acceptance criteria**:
- [ ] `useAuth()` imported from `../lib/auth-context`.
- [ ] When `loading === true`: auth slot renders nothing (prevents hydration flash).
- [ ] When `user !== null` and `!loading`: renders a user email pill (font-mono, 0.6rem, `color: hsl(var(--text-dim))`, max-width 160px, `overflow: hidden`, `text-overflow: ellipsis`, `white-space: nowrap`, full email in `title` attribute).
- [ ] SIGN OUT button appears after the email pill: identical border/font style to the existing `NAVIGATE` dropdown trigger; uses `LogOut` lucide icon at size 10; colour changes to `hsl(var(--col-cyan))` on hover; calls `signOut()` from `useAuth()`.
- [ ] Auth slot is placed after the existing `DomainSwitcher` separator — no second `NavDropdown`, no second `DomainSwitcher`, no logo duplication.
- [ ] Existing AppHeader controls (VECTOR/SQL/GRAPH status dots, NavDropdown, DomainSwitcher) are untouched.
- [ ] `npx tsc --noEmit` passes.

**Key constraints**: `AppHeader` is already `"use client"` — no directive change needed. The 46px header height must not change. Follow exact inline style pattern of existing header buttons.

---

### W4-021: Update `frontend/app/lib/api.ts` — add `accessToken` to `apiFetch` and protected functions

**Phase**: 4 — AppHeader + API Client Integration
**Depends on**: W4-013, W4-015
**Files**:
- `frontend/app/lib/api.ts` — modify

**Acceptance criteria**:
- [ ] `apiFetch<T>(path: string, options?: RequestInit, accessToken?: string): Promise<T>` — new third parameter `accessToken?: string`.
- [ ] When `accessToken` is truthy, adds `Authorization: Bearer <accessToken>` to request headers. When absent or `undefined`, no `Authorization` header is added (backward compatible).
- [ ] The following exported functions gain an `accessToken?: string` parameter (last param, optional) and forward it to `apiFetch`: `postQuery`, `getRuns`, `getRun`, `patchFavourite`, `getAnalyticsDefects`, `getAnalyticsMaintenance`, `getAnalyticsDiseases`.
- [ ] Functions without auth requirement (`getHealth`, `getDocs`, `getChunk`, `triggerIngest`, `getRunById`) remain unchanged.
- [ ] All updated function signatures remain backward-compatible — `accessToken` is always the last, optional parameter.
- [ ] `npx tsc --noEmit` passes with zero errors — `accessToken` typed as `string | undefined`, no `any` casts.

**Key constraints**: Do not break the existing CORS simple-request optimisation on `getHealth()`. Do not add `Authorization` header to `GET /healthz`. The `Content-Type` conditional logic for GET/HEAD requests must remain intact.

---

### W4-022: Update `frontend/app/components/ChatPanel.tsx` — pass `accessToken` to `postQuery()`

**Phase**: 4 — AppHeader + API Client Integration
**Depends on**: W4-021
**Files**:
- `frontend/app/components/ChatPanel.tsx` — modify

**Acceptance criteria**:
- [ ] `useAuth()` imported from `../lib/auth-context`; `accessToken` destructured.
- [ ] All calls to `postQuery(...)` include `accessToken` as the final argument.
- [ ] No other ChatPanel functionality is altered (retry logic, SSE streaming, session_id, conversation_history, clear button, health-check warm-up, citations, examples bridge).
- [ ] `npx tsc --noEmit` passes.

**Key constraints**: `accessToken` may be `null` initially (during `loading`); pass it as `accessToken ?? undefined` to match the `string | undefined` type in `postQuery`. Do not add loading gates that block existing ChatPanel behaviour.

---

### W4-023: Update `frontend/app/components/HistorySidebar.tsx` — pass `accessToken` to history API calls

**Phase**: 4 — AppHeader + API Client Integration
**Depends on**: W4-021
**Files**:
- `frontend/app/components/HistorySidebar.tsx` — modify

**Acceptance criteria**:
- [ ] `useAuth()` imported; `accessToken` destructured.
- [ ] All calls to `getRuns(...)` include `accessToken`.
- [ ] All calls to `patchFavourite(...)` include `accessToken`.
- [ ] Existing favourites-pinned ordering, share URL, and sidebar collapse behaviour unchanged.
- [ ] `npx tsc --noEmit` passes.

**Key constraints**: Pass `accessToken ?? undefined` to handle `null` during initialisation.

---

### W4-024: Update dashboard tab components — pass `accessToken` to analytics API calls

**Phase**: 4 — AppHeader + API Client Integration
**Depends on**: W4-021
**Files**:
- `frontend/app/dashboard/components/Tab3DefectAnalytics.tsx` — modify
- `frontend/app/dashboard/components/Tab4MaintenanceTrends.tsx` — modify
- `frontend/app/dashboard/components/Tab5DataEval.tsx` — modify (if it calls analytics API)

**Acceptance criteria**:
- [ ] `useAuth()` imported in each modified tab component; `accessToken` destructured.
- [ ] All calls to `getAnalyticsDefects(...)`, `getAnalyticsMaintenance(...)`, `getAnalyticsDiseases(...)` include `accessToken`.
- [ ] Dashboard outer div `height: calc(100vh - 46px)` is not altered.
- [ ] Tabs 1 and 2 (`Tab1AgentQuery.tsx`, `Tab2IncidentExplorer.tsx`) are checked: if they call protected API functions, update them; otherwise leave untouched.
- [ ] `npx tsc --noEmit` passes.

**Key constraints**: Pass `accessToken ?? undefined` to handle `null` during initialisation. Do not change chart data processing, date filter logic, or component layout.

---

### W4-025: TypeScript full check — `npx tsc --noEmit`

**Phase**: 4 — AppHeader + API Client Integration
**Depends on**: W4-022, W4-023, W4-024
**Files**:
- No file changes — verification task

**Acceptance criteria**:
- [ ] `npx tsc --noEmit` run from `frontend/` exits with code 0 and zero type errors.
- [ ] Any type errors found must be fixed before this task is marked complete (fix in the relevant Phase 4 task file).
- [ ] `User` type from `@supabase/supabase-js` is used throughout — no `any` casts on `user` or `accessToken`.
- [ ] All `apiFetch` callers pass correctly typed arguments.

**Key constraints**: This is a gate task — Phase 5 must not start until this passes.

---

### W4-026: Document environment variables — frontend `.env.local.example` and backend `.env.example`

**Phase**: 5 — Environment, Deployment & Docs
**Depends on**: W4-008, W4-025
**Files**:
- `frontend/.env.local.example` — create (or update if it already exists)
- `backend/.env.example` — create (or update if it already exists)

**Acceptance criteria**:
- [ ] `frontend/.env.local.example` contains all three new Wave 4 vars with placeholder values and comments:
  - `NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...`
  - `NEXT_PUBLIC_SITE_URL=http://localhost:3005`
- [ ] Existing `NEXT_PUBLIC_API_URL` line is preserved in the example file.
- [ ] `backend/.env.example` contains `SUPABASE_JWT_SECRET=your-supabase-jwt-secret` with a comment explaining where to find it (Supabase dashboard → Settings → API → JWT Settings).
- [ ] Neither file contains real secrets — only placeholder values.
- [ ] `SUPABASE_JWT_SECRET` does NOT appear in any `NEXT_PUBLIC_` variable or any frontend file.

**Key constraints**: These are documentation/example files only — they must be safe to commit to the repository. Real values go in `.env.local` and `.env` which are gitignored.

---

### W4-027: Update `CLAUDE.md` with Wave 4 auth constraints

**Phase**: 5 — Environment, Deployment & Docs
**Depends on**: W4-008, W4-025
**Files**:
- `CLAUDE.md` — modify

**Acceptance criteria**:
- [ ] API endpoint table updated: `POST /query`, `GET /runs`, `GET /runs/{run_id}`, `PATCH /runs/{run_id}/favourite`, `GET /analytics/*` descriptions note "requires Bearer token".
- [ ] Environment variables table includes the four new Wave 4 vars: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SITE_URL` (frontend), `SUPABASE_JWT_SECRET` (backend).
- [ ] Key Constraints section gains auth constraints: `@supabase/ssr` only; `supabase.auth.getUser()` in middleware (not `getSession()`); `SUPABASE_JWT_SECRET` backend-only; `next` param validation pattern.
- [ ] Database table row for `agent_runs` updated to mention `user_id UUID nullable`.
- [ ] New module `backend/app/auth/jwt.py` added to the backend modules architecture table.
- [ ] No existing constraints are removed — only additions and amendments.

**Key constraints**: Follow the exact formatting, heading style, and table structure already in `CLAUDE.md`. Do not restructure sections.

---

### W4-028: Supabase dashboard configuration checklist and smoke test sign-off

**Phase**: 5 — Environment, Deployment & Docs
**Depends on**: W4-026, W4-027
**Files**:
- No code files — operational verification task

**Acceptance criteria**:
- [ ] Supabase dashboard → Auth → URL Configuration → Site URL set to `https://nextgenai-seven.vercel.app`.
- [ ] Supabase dashboard → Auth → URL Configuration → Redirect URLs includes: `https://nextgenai-seven.vercel.app/**` and `http://localhost:3005/**`.
- [ ] Supabase dashboard → Auth → Email → Confirm email: enabled for production.
- [ ] `SUPABASE_JWT_SECRET` added to Render dashboard environment variables (not committed to repo).
- [ ] `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SITE_URL` added to Vercel project environment variables.
- [ ] Migration `0006_add_user_id_to_agent_runs.py` applied to Neon production database.
- [ ] Smoke test — prod sign-up flow: new email → confirmation received → sign in → query submitted → history shows single run → sign out → redirected to `/sign-in`.
- [ ] Smoke test — prod route guard: visit `https://nextgenai-seven.vercel.app/dashboard` while signed out → redirected to `/sign-in?next=/dashboard`.
- [ ] Smoke test — prod API auth: `curl -X POST https://nextgenai-5bf8.onrender.com/query` without token → HTTP 401.
- [ ] Smoke test — `PATCH /runs/{id}/favourite` with another user's run_id → HTTP 404.

**Key constraints**: Neon migration must use the CONCURRENTLY pattern. If JWT secret is rotated in Supabase, Render env var must be updated and backend redeployed. Document any production-only differences in `upgrade.md` or `DEPLOY.md`.

---

## Agent Assignment Reference

All tasks in this plan use the default agent roles from the project's `.claude/agents/` directory:

| Agent | Tasks | Scope |
|---|---|---|
| `backend-architect` | W4-001 → W4-009 | Python deps, JWT module, ORM model, Alembic migration, orchestrator threading, router guards, tests |
| `frontend-developer` | W4-010 → W4-025 | npm install, Supabase clients, AuthContext, layout, middleware, auth pages, AppHeader, api.ts, ChatPanel, HistorySidebar, dashboard tabs, TypeScript check |
| `deployment-engineer` | W4-026 → W4-028 | Env var docs, CLAUDE.md update, Supabase dashboard config, Render/Vercel env vars, Neon migration, smoke tests |

**Total: 28 tasks**
- `backend-architect`: 9 tasks (W4-001 to W4-009)
- `frontend-developer`: 16 tasks (W4-010 to W4-025)
- `deployment-engineer`: 3 tasks (W4-026 to W4-028)

**Critical path** (longest dependency chain):
W4-001 → W4-002 → W4-003 → W4-005 → W4-006 → W4-007 → W4-008 → W4-009 → W4-026 → W4-028
(10 tasks deep on the backend side, all sequential)

Frontend critical path:
W4-010 → W4-011 → W4-013 → W4-015 → W4-016 → (W4-021 via W4-015) → W4-022 → W4-025 → W4-026 → W4-028
(10 tasks deep on the frontend side)

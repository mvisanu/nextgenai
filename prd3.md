# prd3.md — NextAgentAI Wave 4: Supabase Auth

## Product Requirements Document v1.0

**Date:** 2026-03-08
**Status:** Draft — Ready for Implementation

---

## 1. Overview & Goals

### 1.1 What Auth Adds to NextAgentAI

NextAgentAI currently has no access control: any visitor can submit queries, view all run history, and access the analytics dashboard. Wave 4 adds email/password authentication via **Supabase Auth**, giving the platform three concrete capabilities:

1. **Personalisation** — run history (`agent_runs`) is scoped per user; each user sees only their own queries and favourites. The `user_id` (Supabase UUID) is stored on `agent_runs`.
2. **Demo gating** — the query interface, history sidebar, and analytics dashboard are protected behind sign-in. The public landing experience is the sign-in page, which links to sign-up.
3. **Run history ownership** — `PATCH /runs/{run_id}/favourite` and `GET /runs` are user-scoped; the backend verifies the Supabase JWT and attaches `user_id` to every query.

### 1.2 Non-Goals (This Phase)

- No OAuth/social login (Google, GitHub). Email/password only.
- No RBAC or organisation-level access control.
- No Supabase Storage or Realtime features.
- No row-level security (RLS) policies — auth is enforced at the FastAPI layer.
- No account deletion or email-change flows.
- No multi-factor authentication.

---

## 2. User Stories & Acceptance Criteria

### US-001: Sign Up

**As a new visitor, I want to register with my email and password so I can access the platform.**

| # | Acceptance Criterion |
|---|---|
| AC-001-1 | Sign-up form accepts `email` and `password` (min 8 chars). |
| AC-001-2 | On submit, calls `supabase.auth.signUp({ email, password, options: { emailRedirectTo } })`. |
| AC-001-3 | When Supabase has email confirmation enabled: shows "Check your email for a confirmation link" message without redirecting. |
| AC-001-4 | When email confirmation is disabled (dev): redirects to `/` on success. |
| AC-001-5 | Displays inline error for duplicate email: "An account with this email already exists." |
| AC-001-6 | Displays inline error for weak password: "Password must be at least 8 characters." |
| AC-001-7 | Submit button is disabled and shows a spinner while the request is in flight. |
| AC-001-8 | Link to `/sign-in` is present on the sign-up page. |

### US-002: Sign In

**As a registered user, I want to sign in with my email and password.**

| # | Acceptance Criterion |
|---|---|
| AC-002-1 | Sign-in form accepts `email` and `password`. |
| AC-002-2 | On submit, calls `supabase.auth.signInWithPassword({ email, password })`. |
| AC-002-3 | On success, redirects to the `?next=` param path if present, else to `/`. |
| AC-002-4 | Displays inline error for invalid credentials: "Invalid email or password." |
| AC-002-5 | Displays inline error for unconfirmed email: "Please confirm your email before signing in." |
| AC-002-6 | Displays inline error for rate limit: "Too many attempts. Please wait before trying again." |
| AC-002-7 | Submit button disabled and spinner shown during request. |
| AC-002-8 | Links to `/forgot-password` and `/sign-up` present on the sign-in page. |

### US-003: Forgot Password

**As a user who forgot their password, I want to receive a reset email.**

| # | Acceptance Criterion |
|---|---|
| AC-003-1 | Forgot-password form accepts `email` only. |
| AC-003-2 | On submit, calls `supabase.auth.resetPasswordForEmail(email, { redirectTo: RESET_URL })`. |
| AC-003-3 | On success (regardless of whether the email exists), shows: "If that email is registered, a reset link has been sent." — no email enumeration. |
| AC-003-4 | Displays inline error for rate limit: "Too many attempts. Please wait." |
| AC-003-5 | Link back to `/sign-in` present. |

### US-004: Reset Password

**As a user who clicked a reset link in their email, I want to set a new password.**

| # | Acceptance Criterion |
|---|---|
| AC-004-1 | Page at `/reset-password` reads the `#access_token` hash fragment (Supabase appends this to the `redirectTo` URL). |
| AC-004-2 | On `onAuthStateChange` event `PASSWORD_RECOVERY`, the page enables the new-password form. |
| AC-004-3 | On submit, calls `supabase.auth.updateUser({ password: newPassword })`. |
| AC-004-4 | On success, redirects to `/sign-in?message=password-updated`. |
| AC-004-5 | Shows error if token is expired or invalid: "This reset link has expired. Please request a new one." |
| AC-004-6 | Password field has minimum 8-character validation. |

### US-005: Sign Out

**As a signed-in user, I want to sign out.**

| # | Acceptance Criterion |
|---|---|
| AC-005-1 | Sign-out button visible in `AppHeader` when user is authenticated (right side, after the domain switcher separator). |
| AC-005-2 | Calls `supabase.auth.signOut()`. |
| AC-005-3 | Redirects to `/sign-in` on success. |
| AC-005-4 | `AuthContext` user state is set to `null`. |
| AC-005-5 | Session cookies are cleared by the `@supabase/ssr` middleware. |

### US-006: Session Persistence

**As a signed-in user, I expect to remain signed in across page refreshes and new tabs.**

| # | Acceptance Criterion |
|---|---|
| AC-006-1 | Supabase session is stored in cookies (not `localStorage`) via `@supabase/ssr`. |
| AC-006-2 | Next.js middleware reads the cookie on every request and refreshes the token if expired. |
| AC-006-3 | `AuthContext` initialises with the persisted user from `supabase.auth.getUser()` on mount. |
| AC-006-4 | No full-page flash/redirect on refresh when session is valid. |

### US-007: Route Protection

**As an unauthenticated visitor, I should be redirected to sign-in when accessing protected routes.**

| # | Acceptance Criterion |
|---|---|
| AC-007-1 | Protected routes: `/`, `/dashboard`, `/data`, `/review`, `/examples`, `/medical-examples`, `/agent`, `/diagram`, `/faq`. |
| AC-007-2 | Public routes: `/sign-in`, `/sign-up`, `/forgot-password`, `/reset-password`. |
| AC-007-3 | Redirect uses the pattern `/sign-in?next=<original-path>`. |
| AC-007-4 | After sign-in, user is redirected to the originally requested path (from `?next=`). |
| AC-007-5 | Redirect is enforced in Next.js middleware (server-side), not only client-side. |

---

## 3. Architecture Decisions

### 3.1 Supabase Project Configuration

Supabase Auth uses its **own hosted PostgreSQL database** for auth tables (`auth.users`, `auth.sessions`, etc.). This is entirely separate from the Neon PostgreSQL database used for application data.

**Decision: Use Supabase's hosted PostgreSQL for auth only.**

Rationale:
- Neon is already handling pgvector workloads; mixing Supabase RLS migrations into the Neon schema adds risk.
- Supabase Auth's `auth.*` tables are managed automatically by Supabase infrastructure.
- The only linkage needed is `user_id UUID` (the Supabase user UUID) stored as a column on `agent_runs` in Neon.
- JWT verification on the FastAPI backend is done using `SUPABASE_JWT_SECRET` — no outbound HTTP call required per request.

### 3.2 SSR Package Choice

**Decision: Use `@supabase/ssr` (not the deprecated `@supabase/auth-helpers-nextjs`).**

`@supabase/ssr` is the current recommended package for Next.js App Router. It provides:
- `createBrowserClient` for client components
- `createServerClient` for Server Components, Route Handlers, and middleware
- Cookie-based session management compatible with App Router's server/client split
- Automatic token refresh in middleware via `supabase.auth.getUser()`

Packages to install: `@supabase/ssr` (latest stable) + `@supabase/supabase-js` v2.

### 3.3 Session State Architecture

Session state follows the existing context pattern (`RunContext`, `DomainContext`) in `frontend/app/lib/`:

- `AuthContext` (`frontend/app/lib/auth-context.tsx`) — client-side context holding `user: User | null`, `accessToken: string | null`, and `loading: boolean`
- Initialised via `supabase.auth.getUser()` on mount
- `onAuthStateChange` subscription keeps context in sync across tabs and after token refresh
- Provider wraps the tree in `layout.tsx` alongside existing `RunProvider` and `DomainProvider`

### 3.4 AppHeader Integration

`AppHeader` is a `"use client"` component. The user email pill and sign-out button are added to the right side of the header, after the existing `DomainSwitcher` separator, following the exact same inline style pattern used by existing header buttons.

`useAuth()` from `AuthContext` provides `user`, `accessToken`, and `signOut`. When `user === null`, nothing is rendered in this slot (middleware already redirected unauthenticated users).

### 3.5 Backend JWT Verification

**Decision: FastAPI validates Supabase JWTs locally using `python-jose` + `SUPABASE_JWT_SECRET`.**

The Supabase JWT is a standard HS256 JWT signed with the project's `JWT_SECRET` (available in Supabase dashboard → Settings → API). FastAPI decodes and verifies it without calling the Supabase API on each request.

Protected endpoints: `POST /query`, `GET /runs`, `PATCH /runs/{run_id}/favourite`, `GET /runs/{run_id}`, `GET /analytics/*`

Public endpoints: `GET /healthz`, `POST /ingest`, `GET /docs`, root `GET /`

The `user_id` is extracted from the JWT `sub` claim (Supabase user UUID) and attached to newly saved `agent_runs` rows.

### 3.6 `user_id` on `agent_runs`

A new Alembic migration `0006_add_user_id_to_agent_runs.py` adds:
```
user_id UUID NULLABLE
```
Nullable to preserve all existing rows. New runs written by authenticated users will have `user_id` set. `GET /runs` queries are filtered by `user_id` when a valid JWT is present.

---

## 4. Frontend Implementation Plan

### 4.1 New npm Packages

```
@supabase/supabase-js   ^2.x   (latest stable)
@supabase/ssr           ^0.x   (latest stable)
```

No other new dependencies. All form components use existing Tailwind + inline SCADA styles.

### 4.2 File Delivery Table

| File | Type | Purpose |
|---|---|---|
| `frontend/app/lib/supabase.ts` | New | Browser Supabase client singleton via `createBrowserClient` |
| `frontend/app/lib/supabase-server.ts` | New | Server Supabase client factory via `createServerClient` (RSC / Route Handlers) |
| `frontend/middleware.ts` | New | Next.js middleware: session refresh + route protection redirects |
| `frontend/app/lib/auth-context.tsx` | New | `AuthContext` + `AuthProvider` + `useAuth()` hook — matches `RunContext` pattern |
| `frontend/app/(auth)/sign-in/page.tsx` | New | Sign-in page |
| `frontend/app/(auth)/sign-up/page.tsx` | New | Sign-up page |
| `frontend/app/(auth)/forgot-password/page.tsx` | New | Forgot password page |
| `frontend/app/(auth)/reset-password/page.tsx` | New | Reset password page (reads `#access_token` hash) |
| `frontend/app/layout.tsx` | Modify | Add `<AuthProvider>` wrapping existing providers |
| `frontend/app/components/AppHeader.tsx` | Modify | Add user email pill + SIGN OUT button to right side |
| `frontend/app/lib/api.ts` | Modify | Add `Authorization: Bearer <token>` header injection to `apiFetch` |

### 4.3 `frontend/app/lib/supabase.ts`

- Exports a singleton `createBrowserClient` instance.
- Called from client components and `auth-context.tsx`.
- Uses `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

```typescript
import { createBrowserClient } from '@supabase/ssr'

export const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)
```

### 4.4 `frontend/app/lib/supabase-server.ts`

- Exports a `createClient()` factory for server-side use (Server Components, Route Handlers).
- Uses `cookies()` from `next/headers` with read-only `getAll`.
- Must be called inside async Server Components or Route Handlers only.

### 4.5 `frontend/middleware.ts`

Located at `frontend/middleware.ts` (Next.js App Router convention — note: NOT inside `app/`).

**Responsibilities:**
1. Create a `createServerClient` instance with full `getAll`/`setAll` cookie access on the request/response pair.
2. Call `await supabase.auth.getUser()` — refreshes session token if expired, writes updated cookies to response.
3. Check if the current path requires auth. If `user` is null and path is protected, redirect to `/sign-in?next=<path>`.
4. Allow all `/(auth)/` paths through without check.

**Matcher config:**
```typescript
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon|api/docs|api/openapi).*)'],
}
```

**Critical:** `supabase.auth.getUser()` MUST be called (not `getSession()`) — it verifies the token server-side and triggers cookie refresh.

**Protected paths:** `/`, `/dashboard`, `/data`, `/review`, `/examples`, `/medical-examples`, `/agent`, `/diagram`, `/faq`

**Public paths:** `/sign-in`, `/sign-up`, `/forgot-password`, `/reset-password`

**Open redirect protection:** Validate `next` param — must start with `/` and not contain `://` or start with `//`. Reject and default to `/` if invalid.

### 4.6 `frontend/app/lib/auth-context.tsx`

Follows the exact structural pattern as `frontend/app/lib/context.tsx` (`RunContext`):

```typescript
"use client"

interface AuthContextValue {
  user: User | null          // supabase User type
  accessToken: string | null // JWT for API calls
  loading: boolean           // true until getUser() resolves on mount
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) { ... }
export function useAuth(): AuthContextValue { ... }
```

**Implementation notes:**
- On mount: calls `supabase.auth.getUser()` to populate `user` and set `loading = false`.
- Subscribes to `supabase.auth.onAuthStateChange()` to keep `user` and `accessToken` in sync. Handles `TOKEN_REFRESHED`, `SIGNED_IN`, `SIGNED_OUT`, `PASSWORD_RECOVERY`.
- `signOut()` calls `supabase.auth.signOut()` then `router.push('/sign-in')`.
- `loading = true` guard prevents flash of unauthenticated content during SSR hydration.

### 4.7 Auth Pages — `frontend/app/(auth)/`

The `(auth)` route group is a Next.js App Router route group (parentheses = no URL segment). All four pages inherit the root `layout.tsx` (which provides `AppHeader`).

**Shared UI constraints for all auth pages:**
- Full-height container: `height: calc(100vh - 46px)` (accounts for 46px AppHeader).
- Dark background: `background: hsl(var(--bg-void))`.
- Form card: `background: hsl(var(--bg-surface))`, border `hsl(var(--border-base))`, border-radius `2px`, max-width `420px`, centred.
- Heading: `font-family: var(--font-display)` (Orbitron), `font-size: 1rem`, `letter-spacing: 0.2em`, `text-transform: uppercase`, colour `hsl(var(--col-green))`.
- Labels: `font-family: var(--font-mono)`, `font-size: 0.65rem`, `letter-spacing: 0.1em`, `color: hsl(var(--text-dim))`.
- Inputs: `font-family: var(--font-mono)`, dark background `hsl(var(--bg-void))`, border `hsl(var(--border-base))`, focus border `hsl(var(--col-green))`, border-radius `2px`. Match ChatPanel query input style.
- Primary button: `background: hsl(var(--col-green) / 0.15)`, border `hsl(var(--col-green))`, text `hsl(var(--col-green))`, hover: `background: hsl(var(--col-green) / 0.25)`. Font: `var(--font-display)`, `font-size: 0.6rem`, `letter-spacing: 0.14em`.
- Error display: `AlertCircle` lucide icon, `color: hsl(var(--col-red))`, `font-family: var(--font-mono)`, `font-size: 0.72rem`. Matches ChatPanel error banner style.
- Success/info display: same structure but `color: hsl(var(--col-cyan))`.
- All pages are `"use client"` components.

**`/sign-in/page.tsx` specifics:**
- Fields: Email, Password.
- On submit: `supabase.auth.signInWithPassword({ email, password })`.
- Error mapping: `Invalid login credentials` → "Invalid email or password." | `Email not confirmed` → "Please confirm your email before signing in." | rate limit → "Too many attempts."
- On success: `router.push(searchParams.get('next') ?? '/')`.
- Shows info banner if `searchParams.get('message') === 'password-updated'`: "Your password has been updated."
- Footer links: "Don't have an account? SIGN UP" → `/sign-up`, "Forgot password?" → `/forgot-password`.

**`/sign-up/page.tsx` specifics:**
- Fields: Email, Password, Confirm Password (client-side match validation).
- On submit: `supabase.auth.signUp({ email, password, options: { emailRedirectTo: SITE_URL + '/sign-in' } })`.
- If `data.user && !data.session`: show "Check your email for a confirmation link."
- If `data.session`: redirect to `/`.
- Footer link: "Already have an account? SIGN IN" → `/sign-in`.

**`/forgot-password/page.tsx` specifics:**
- Field: Email only.
- On submit: `supabase.auth.resetPasswordForEmail(email, { redirectTo: SITE_URL + '/reset-password' })`.
- Always shows success message (no email enumeration).
- Footer link: back to `/sign-in`.

**`/reset-password/page.tsx` specifics:**
- On mount: subscribe to `supabase.auth.onAuthStateChange`. When event is `PASSWORD_RECOVERY`, enable the form.
- Field: New Password (min 8 chars).
- On submit: `supabase.auth.updateUser({ password: newPassword })`.
- On success: `router.push('/sign-in?message=password-updated')`.
- On expired token: "This reset link has expired. Please request a new one." with link to `/forgot-password`.

### 4.8 `frontend/app/layout.tsx` Modifications

Add `AuthProvider` as the outermost app-state provider:

```
<ThemeProvider>
  <AuthProvider>          ← ADD (wraps everything below)
    <DomainProvider>
      <RunProvider>
        <AppHeader />
        {children}
      </RunProvider>
    </DomainProvider>
  </AuthProvider>
</ThemeProvider>
```

### 4.9 `frontend/app/components/AppHeader.tsx` Modifications

After the final vertical separator on the right side, add:

1. **User email pill** (when `user !== null` and `!loading`): `font-family: var(--font-mono)`, `0.6rem`, `color: hsl(var(--text-dim))`, max-width 160px, overflow ellipsis, full email in `title` attribute.
2. **SIGN OUT button**: Identical style to the `NAVIGATE` dropdown trigger (border, mono font, `--col-cyan` hover). Uses `LogOut` lucide icon at size 10. Calls `signOut()` from `useAuth()`.

When `loading === true`, render nothing in this slot to avoid hydration flash.

### 4.10 `frontend/app/lib/api.ts` Modifications

Update `apiFetch` to accept an optional `accessToken` parameter:

```typescript
async function apiFetch<T>(
  path: string,
  options?: RequestInit,
  accessToken?: string
): Promise<T>
```

When `accessToken` is provided, add `Authorization: Bearer <token>` to request headers.

Update all protected exported functions to accept and forward `accessToken?: string`:
- `postQuery`, `getRuns`, `getRun`, `patchFavourite`, `getAnalyticsDefects`, `getAnalyticsMaintenance`, `getAnalyticsDiseases`

Callers obtain the token from `useAuth().accessToken`.

---

## 5. Backend Implementation Plan

### 5.1 New Python Dependency

Add to `backend/requirements.txt`:
```
python-jose[cryptography]>=3.3.0
```

### 5.2 JWT Auth Module

Create `backend/app/auth/jwt.py`:

- `verify_token(token: str) -> dict` — decodes and validates the JWT using `SUPABASE_JWT_SECRET` (HS256). Returns claims dict on success.
- Raises `HTTPException(401)` if: token missing, signature invalid, token expired, or `sub` claim absent.
- FastAPI dependency `get_current_user(request: Request) -> dict` — extracts `Authorization: Bearer <token>` header, calls `verify_token`, returns claims.

Also create `backend/app/auth/__init__.py`.

The dependency is applied **per-router** (not globally) so `/healthz` and `/ingest` remain public.

### 5.3 Protected Endpoint Changes

| Router file | Endpoint | Change |
|---|---|---|
| `backend/app/api/query.py` | `POST /query` | Add `Depends(get_current_user)` — `user_id = current_user["sub"]` passed to orchestrator and stored on `agent_runs`. |
| `backend/app/api/runs.py` | `GET /runs` | Add `Depends(get_current_user)` — add `WHERE user_id = :user_id` filter. |
| `backend/app/api/runs.py` | `GET /runs/{run_id}` | Add `Depends(get_current_user)` — add `AND user_id = :user_id` guard. |
| `backend/app/api/runs.py` | `PATCH /runs/{run_id}/favourite` | Add `Depends(get_current_user)` — add `AND user_id = :user_id` guard; return 404 for other users' runs. |
| `backend/app/api/analytics.py` | `GET /analytics/*` | Add `Depends(get_current_user)` — analytics are not user-scoped but require auth. |

Public (no auth required): `GET /healthz`, `POST /ingest`, `GET /docs`, root.

### 5.4 Orchestrator `user_id` Threading

`orchestrator.run()` gains an optional `user_id: str | None = None` parameter. When saving the `agent_runs` row at the end of the run (`_save_run()`), `user_id` is included in the INSERT.

### 5.5 Alembic Migration `0006_add_user_id_to_agent_runs.py`

```python
"""Add user_id to agent_runs

Revision ID: 0006_add_user_id
Revises: 0005_wave3_indexes
Create Date: 2026-03-08
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0006_add_user_id"
down_revision = "0005_wave3_indexes"
branch_labels = None
depends_on = None

def upgrade() -> None:
    op.add_column(
        "agent_runs",
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.execute("COMMIT")
    op.execute("""
        CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_agent_runs_user_id
        ON agent_runs (user_id, created_at DESC)
    """)

def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_agent_runs_user_id")
    op.drop_column("agent_runs", "user_id")
```

### 5.6 `AgentRun` ORM Model Update

Add to `AgentRun` in `backend/app/db/models.py`:
```python
from sqlalchemy.dialects.postgresql import UUID as PGUUID
user_id = Column(PGUUID(as_uuid=True), nullable=True, index=True)
```

---

## 6. Environment Variables

### 6.1 Frontend

| Variable | Description | Where to Set |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL (e.g. `https://xxxx.supabase.co`) | `frontend/.env.local` (dev), Vercel dashboard (prod) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon/public key | `frontend/.env.local` (dev), Vercel dashboard (prod) |
| `NEXT_PUBLIC_SITE_URL` | Full frontend URL for email redirect links | `frontend/.env.local` (`http://localhost:3005` dev), Vercel dashboard (`https://nextgenai-seven.vercel.app` prod) |

### 6.2 Backend

| Variable | Description | Where to Set |
|---|---|---|
| `SUPABASE_JWT_SECRET` | JWT secret from Supabase dashboard → Settings → API → JWT Settings | `.env` (dev), Render dashboard (prod) |

### 6.3 Supabase Dashboard Configuration

| Setting | Value |
|---|---|
| Auth → Email → Confirm email | Enabled (prod), can disable for dev |
| Auth → URL Configuration → Site URL | `https://nextgenai-seven.vercel.app` |
| Auth → URL Configuration → Redirect URLs | `https://nextgenai-seven.vercel.app/**`, `http://localhost:3005/**` |
| Auth → Email Templates → Reset Password | `redirectTo` points to `NEXT_PUBLIC_SITE_URL/reset-password` |

### 6.4 Updated `frontend/.env.local` Template

```bash
# Existing
NEXT_PUBLIC_API_URL=http://localhost:8000

# Wave 4 — Auth
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
NEXT_PUBLIC_SITE_URL=http://localhost:3005
```

---

## 7. UI/UX Specification

### 7.1 Auth Page Layout

```
[AppHeader — 46px, always visible]
[full-height container: calc(100vh - 46px), bg: hsl(var(--bg-void))]
  [centred card: max-width 420px, bg: hsl(var(--bg-surface)), border: hsl(var(--border-base)), p: 32px, border-radius: 2px]
    [panel header bar: .panel-hdr style, Orbitron title in --col-green]
    [form fields with --font-mono inputs]
    [primary button: --col-green accent, --font-display label]
    [error/success message: AlertCircle icon + mono text]
    [footer links: --font-mono, --text-dim]
```

The `.panel-hdr`, `.panel-dot`, `.corner-tl` etc. CSS classes already exist in `globals.css` — reuse them to match the existing panel aesthetic.

### 7.2 Error Display Styling

Matches the existing ChatPanel error banner:

```tsx
<div style={{
  display: "flex", alignItems: "flex-start", gap: "8px",
  padding: "10px 12px",
  background: "hsl(var(--col-red) / 0.1)",
  border: "1px solid hsl(var(--col-red) / 0.3)",
  borderRadius: "2px",
  color: "hsl(var(--col-red))",
  fontFamily: "var(--font-mono)",
  fontSize: "0.72rem",
  lineHeight: 1.5,
}}>
  <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
  <span>{errorMessage}</span>
</div>
```

If `--col-red` is not yet defined in the CSS var system, add it to `globals.css` with fallback `0 84% 60%` (Tailwind red-500 in HSL).

### 7.3 AppHeader User Pill (right side, after DomainSwitcher)

```
[vertical separator]
[email pill: font-mono 0.6rem, text-dim, max-w-160px, overflow ellipsis, title=fullEmail]
[SIGN OUT button: NAVIGATE-trigger style, --col-cyan hover, LogOut icon size 10]
```

### 7.4 Protected Route Redirect UX

- Middleware redirects to `/sign-in?next=/dashboard` — no "unauthorised" error shown, just the normal sign-in form.
- After sign-in: `router.push(searchParams.get('next') ?? '/')`.
- `next` param validated: must start with `/`, must not contain `://` or start with `//`.

### 7.5 Loading State

During `AuthContext` initialisation (`loading === true`): `AppHeader` renders its user slot as empty. Auth pages themselves do not show a loading spinner (middleware handles redirect before page renders).

---

## 8. Acceptance Criteria Checklist

### 8.1 Functional

- [ ] Sign up with new email → confirmation email received (prod) or session created (dev).
- [ ] Sign in with valid credentials → redirected to `/`.
- [ ] Sign in with invalid credentials → inline error displayed.
- [ ] Sign in with unconfirmed email → specific error message shown.
- [ ] Forgot password → success message shown regardless of email existence.
- [ ] Reset password via email link → new password accepted, redirected to sign-in.
- [ ] Sign out → session cleared, redirected to `/sign-in`.
- [ ] Refresh page when signed in → session persists, no redirect.
- [ ] Visit `/dashboard` while signed out → redirected to `/sign-in?next=/dashboard`.
- [ ] After sign-in from redirect → returned to `/dashboard`.
- [ ] `AppHeader` shows user email and SIGN OUT when authenticated.
- [ ] `POST /query` without token → `HTTP 401`.
- [ ] `POST /query` with valid token → `HTTP 200`, `user_id` stored on `agent_runs`.
- [ ] `GET /runs` with valid token → returns only runs for that user.
- [ ] `PATCH /runs/{id}/favourite` with another user's run_id → `HTTP 404`.

### 8.2 TypeScript

- [ ] `tsc --noEmit` passes with zero errors in `frontend/`.
- [ ] `user` in `AuthContext` typed as `import('@supabase/supabase-js').User | null` — no `any` casts.
- [ ] `apiFetch` `accessToken` parameter is `string | undefined`.

### 8.3 Existing Tests

- [ ] `backend/.venv/Scripts/python -m pytest tests/` — 520 passed, 5 skipped (no regressions).
- [ ] New: `backend/tests/test_auth_jwt.py` — covers `verify_token` success, expired token 401, missing token 401, wrong secret 401.
- [ ] New: `backend/tests/test_wave4_user_id.py` — covers `user_id` storage on `POST /query`.

### 8.4 Security

- [ ] JWT secret not logged or exposed in error responses.
- [ ] `next` redirect param validated as relative path (starts with `/`, no `://`, no `//`).
- [ ] `SUPABASE_JWT_SECRET` never in frontend code or `NEXT_PUBLIC_` env vars.
- [ ] Supabase anon key is safe to expose client-side (by design — it is a public key).

---

## 9. Constraints & Risks

### 9.1 Constraints

| Constraint | Detail |
|---|---|
| Do not break existing functionality | All existing pages, ChatPanel, AgentTimeline, GraphViewer, Dashboard, HistorySidebar must work identically. |
| `@supabase/ssr` only | The deprecated `@supabase/auth-helpers-nextjs` is not permitted. |
| AppHeader: no duplicate controls | Auth additions are additive to the right side only. No second DomainSwitcher or NavDropdown. |
| Dashboard height unchanged | `height: calc(100vh - 46px)` — no change. |
| `asyncio.get_running_loop()` — no regression | Adding `user_id` to orchestrator must not reintroduce `get_event_loop()` (CR-007). |
| `ORJSONResponse` default | Auth error responses from FastAPI use `ORJSONResponse` automatically (already the default). |
| Alembic CONCURRENTLY pattern | Migration 0006 must follow the proven pattern: `op.execute("COMMIT")` before `CREATE INDEX CONCURRENTLY`. |

### 9.2 Risks & Mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| Token expiry mid-session | Medium | `@supabase/ssr` middleware auto-refreshes tokens. `onAuthStateChange` `TOKEN_REFRESHED` event updates `accessToken` in `AuthContext`. |
| `react-19` / `next-16` compatibility with `@supabase/ssr` | Low-Medium | `@supabase/ssr` supports Next.js 13+. Use `--legacy-peer-deps` if peer dep conflicts arise. |
| Existing `agent_runs` rows have no `user_id` | Certain | Nullable column — existing rows unaffected. `GET /runs` filters by `user_id`, so anonymous rows are never returned. Acceptable. |
| `SUPABASE_JWT_SECRET` rotation | Low | If rotated in Supabase dashboard, update env var on Render and redeploy. Document in `DEPLOY.md`. |
| `PASSWORD_RECOVERY` event timing on `/reset-password` | Low | Ensure `createBrowserClient` is initialised before `onAuthStateChange` listener is registered. |
| Open redirect via `?next=` | Medium | Validate `next` in middleware: must start with `/` and not contain `://` or `//`. |
| Neon migration 0006 requires CONCURRENTLY | Certain | Follow 0005 pattern exactly. |

---

## 10. Implementation Sequencing

### Phase 1 — Backend (no frontend breakage risk)
1. Add `python-jose[cryptography]` to `requirements.txt`.
2. Create `backend/app/auth/jwt.py` — `verify_token()` and `get_current_user` dependency.
3. Add `user_id` column to `AgentRun` ORM model.
4. Write migration `0006_add_user_id_to_agent_runs.py`.
5. Thread `user_id` through `orchestrator.run()` → `_save_run()`.
6. Add `Depends(get_current_user)` to protected routers.
7. Write `backend/tests/test_auth_jwt.py` and `test_wave4_user_id.py`.
8. Run full test suite — 525+ passing.
9. Apply migration to Neon (prod) and local Docker DB.

### Phase 2 — Frontend Auth Infrastructure
1. `npm install @supabase/supabase-js @supabase/ssr` (from `frontend/`).
2. Create `frontend/app/lib/supabase.ts` (browser client).
3. Create `frontend/app/lib/supabase-server.ts` (server client).
4. Create `frontend/app/lib/auth-context.tsx` (`AuthProvider` + `useAuth`).
5. Update `frontend/app/layout.tsx` — add `<AuthProvider>`.
6. Create `frontend/middleware.ts` (session refresh + route protection).
7. Verify: visit `http://localhost:3005/` without session → redirected to `/sign-in`.

### Phase 3 — Auth Pages
1. Create `frontend/app/(auth)/sign-in/page.tsx`.
2. Create `frontend/app/(auth)/sign-up/page.tsx`.
3. Create `frontend/app/(auth)/forgot-password/page.tsx`.
4. Create `frontend/app/(auth)/reset-password/page.tsx`.
5. Test all four flows end-to-end (dev, email confirm disabled).

### Phase 4 — AppHeader + API Client Integration
1. Update `frontend/app/components/AppHeader.tsx` — user pill + SIGN OUT button.
2. Update `frontend/app/lib/api.ts` — `accessToken` parameter on `apiFetch` and protected functions.
3. Update `ChatPanel.tsx` to pass `accessToken` from `useAuth()` to `postQuery()`.
4. Update `HistorySidebar.tsx` to pass `accessToken` to `getRuns()` and `patchFavourite()`.
5. Update dashboard tab components to pass `accessToken` to analytics functions.
6. TypeScript check: `npx tsc --noEmit`.

### Phase 5 — QA & Deployment
1. Full auth flow test (sign up → confirm → sign in → query → history → favourite → sign out).
2. Test `/reset-password` flow with a real email link.
3. Verify `PATCH /runs/{id}/favourite` returns 404 for another user's run.
4. Deploy backend to Render with `SUPABASE_JWT_SECRET` in dashboard.
5. Deploy frontend to Vercel with `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SITE_URL`.
6. Configure Supabase Redirect URLs in Supabase dashboard.
7. Run smoke tests on live URLs.

---

## 11. Reference Files for Implementation

| File | Relevance |
|---|---|
| `frontend/app/layout.tsx` | Modify to add `<AuthProvider>`; insertion point is between `<ThemeProvider>` and `<DomainProvider>` |
| `frontend/app/components/AppHeader.tsx` | Modify right side — follow exact inline style pattern; use `useAuth()` |
| `frontend/app/lib/context.tsx` | Pattern reference for `AuthContext` structure |
| `frontend/app/lib/domain-context.tsx` | Pattern reference for provider/hook pattern |
| `frontend/app/lib/api.ts` | Modify `apiFetch` and all protected API functions |
| `frontend/app/components/ChatPanel.tsx` | Pass `accessToken` to `postQuery()` |
| `backend/app/db/models.py` | Add `user_id` to `AgentRun` — canonical schema source of truth |
| `backend/app/db/migrations/versions/0005_wave3_indexes.py` | Pattern reference for CONCURRENTLY + `op.execute("COMMIT")` |
| `backend/app/api/query.py` | Add `Depends(get_current_user)` to `POST /query` |
| `backend/app/agent/orchestrator.py` | Add `user_id` parameter to `run()` and `_save_run()` |

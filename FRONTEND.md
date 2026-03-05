# FRONTEND.md — NextAgentAI Frontend Implementation Plan

**Version:** 1.0.0
**Date:** 2026-03-04
**Implements:** T-031-F through T-036-F, T-038

---

## 1. Component Tree and State Flow

```
app/
├── layout.tsx                    # Root HTML shell, RunProvider wrapper
├── page.tsx                      # Four-panel CSS grid layout
│   ├── ChatPanel                 # Left column (top)
│   │   └── CitationsDrawer       # Right-side Sheet, opened by citation clicks
│   ├── AgentTimeline             # Left column (bottom)
│   ├── GraphViewer               # Right column (top)
│   └── (Citations panel label)   # Right column (bottom) — state lives in drawer
│
├── components/
│   ├── ChatPanel.tsx
│   ├── AgentTimeline.tsx
│   ├── GraphViewer.tsx
│   └── CitationsDrawer.tsx
│
└── lib/
    ├── api.ts                    # Typed API client
    └── context.tsx               # RunContext — shared state across panels
```

### State Flow Diagram

```
User types query
      │
      ▼
ChatPanel.handleSubmit()
      │  calls postQuery(query)
      ▼
api.ts → POST /query → backend
      │
      ▼ QueryResponse
ChatPanel receives response
      │
      ├─ stores answer, claims  ──► renders markdown answer + [1][2] citation links
      │
      └─ calls setRunData(response)  ──► RunContext updates
                │
                ├──► AgentTimeline reads runData.run_summary.steps
                │
                ├──► GraphViewer reads runData.graph_path
                │
                └──► CitationsDrawer reads runData.claims (opened by citation click)
                           │  calls getChunk(doc_id, chunk_id)
                           ▼
                     GET /docs/{doc_id}/chunks/{chunk_id}
                           │
                           ▼ ChunkResponse
                     Renders chunk_text with <mark> highlight
```

---

## 2. Shared State vs Local State

### React Context (`RunContext`) — Shared across panels

```typescript
interface RunContextValue {
  runData: QueryResponse | null;     // Full response from POST /query
  setRunData: (data: QueryResponse) => void;
}
```

**Why context:** AgentTimeline and GraphViewer need data from the ChatPanel's API response but are not parent/child components in the panel grid. Context avoids prop drilling through the layout.

### Local State (component-scoped)

| Component       | Local State                                                        |
|-----------------|--------------------------------------------------------------------|
| ChatPanel       | `messages[]`, `inputValue`, `isLoading`, `error`                  |
| CitationsDrawer | `isOpen`, `activeCitation`, `chunkData`, `isFetchingChunk`, `chunkError` |
| GraphViewer     | `selectedNode` (for popover), `popoverOpen`                        |
| AgentTimeline   | None (pure render from context)                                    |

---

## 3. API Calls

| Function           | Endpoint                                 | Trigger                          | Updates State                        |
|--------------------|------------------------------------------|----------------------------------|--------------------------------------|
| `postQuery()`      | `POST /query`                            | User submits query (Enter/button)| `runData` in context, local messages |
| `getRunById()`     | `GET /runs/{run_id}`                     | Not used in UI (available in lib)| N/A                                  |
| `getChunk()`       | `GET /docs/{doc_id}/chunks/{chunk_id}`   | User clicks citation link `[N]`  | `chunkData` in CitationsDrawer       |
| `getHealth()`      | `GET /healthz`                           | App mount (optional warm-up check) | N/A (error boundary / toast)       |

### API Error Handling

| HTTP Status | Behaviour |
|-------------|-----------|
| 500         | Show shadcn `Alert` with `detail` message in ChatPanel |
| 404         | Show "Source not found" in CitationsDrawer |
| Network error | Show "Unable to reach server. Backend may be warming up — try again in 30 seconds." |

---

## 4. shadcn/ui Components Used Per Feature

| Feature             | shadcn/ui Components                                           |
|---------------------|----------------------------------------------------------------|
| Layout panels       | `Card`, `CardHeader`, `CardTitle`, `CardContent`              |
| Chat input          | `Textarea`, `Button`                                           |
| Loading state       | `Skeleton`                                                     |
| Error display       | `Alert`, `AlertDescription`                                    |
| Timeline steps      | `Badge`, `ScrollArea`, `Separator`                             |
| Citations drawer    | `Sheet`, `SheetContent`, `SheetHeader`, `SheetTitle`, `Badge` |
| Node popover        | `Popover`, `PopoverContent`, `PopoverTrigger`                  |
| Confidence badges   | `Badge` (variant mapped: green/yellow/red via className)       |

**Rule:** No raw `<button>`, `<input>`, or `<textarea>` elements — always use shadcn/ui wrappers.

---

## 5. Folder Structure

```
frontend/
├── app/
│   ├── layout.tsx                 # Root layout with RunProvider
│   ├── page.tsx                   # Four-panel grid (Chat, Timeline, Graph, Citations)
│   ├── globals.css                # Tailwind base + shadcn CSS variables
│   ├── components/
│   │   ├── ChatPanel.tsx
│   │   ├── AgentTimeline.tsx
│   │   ├── GraphViewer.tsx
│   │   └── CitationsDrawer.tsx
│   └── lib/
│       ├── api.ts                 # Typed API client
│       └── context.tsx            # RunContext provider + hook
├── components/
│   └── ui/                        # shadcn/ui generated components (auto-generated)
├── lib/
│   └── utils.ts                   # shadcn cn() utility
├── Dockerfile
├── next.config.ts
├── package.json
├── postcss.config.mjs
├── tailwind.config.ts
└── tsconfig.json
```

**Path alias:** `@/` maps to the project root (where `components/ui/` lives). `@/app/` maps to `app/`.

---

## 6. TypeScript Interfaces

All interfaces are defined in `app/lib/api.ts` and re-exported. They are derived directly from BACKEND.md with zero modification.

Key interfaces:
- `QueryRequest` — POST /query body
- `QueryResponse` — POST /query response (includes `run_id`, `answer`, `claims`, `graph_path`, `run_summary`)
- `ChunkResponse` — GET /docs/{doc_id}/chunks/{chunk_id} response
- `Citation`, `Claim`, `GraphNode`, `GraphEdge`, `StepSummary`, `RunSummary` — nested types

---

## 7. Environment Variables

| Variable              | Required | Default (local dev)       | Description                       |
|-----------------------|----------|---------------------------|-----------------------------------|
| `NEXT_PUBLIC_API_URL` | Yes      | `http://localhost:8000`   | Backend base URL (client-side)    |

Set in `.env.local` for local development:
```
NEXT_PUBLIC_API_URL=http://localhost:8000
```

For Docker Compose:
```
NEXT_PUBLIC_API_URL=http://backend:8000
```

For Vercel:
```
NEXT_PUBLIC_API_URL=https://nextai-backend.onrender.com
```

---

## 8. How to Run Locally

### Prerequisites
- Node.js 20+
- npm 10+
- Backend running on port 8000 (Docker Compose or local Python)

### Steps

```bash
# 1. Navigate to the frontend directory
cd NextAgentAI/frontend

# 2. Install dependencies
npm install

# 3. Create local env file
echo "NEXT_PUBLIC_API_URL=http://localhost:8000" > .env.local

# 4. Start the development server
npm run dev

# App runs at http://localhost:3000
```

### With Docker Compose (full stack)

```bash
# From the repo root
cp .env.example .env
# Edit .env — set ANTHROPIC_API_KEY at minimum

docker compose up --build
# Frontend: http://localhost:3000
# Backend:  http://localhost:8000
```

---

## 9. How to Deploy to Vercel

### One-click deploy (recommended)

1. Push the repo to GitHub.
2. Sign in to [vercel.com](https://vercel.com) → "New Project" → import the GitHub repo.
3. Vercel auto-detects Next.js in `frontend/`.
4. Set the **Root Directory** to `frontend/` in Vercel project settings.
5. Add environment variable:
   - `NEXT_PUBLIC_API_URL` = `https://nextai-backend.onrender.com` (your Render backend URL)
6. Click **Deploy**.

Subsequent `git push` to `main` triggers automatic Vercel redeploys.

### Manual CLI deploy

```bash
npm install -g vercel
cd frontend
vercel --prod
# Set NEXT_PUBLIC_API_URL when prompted
```

---

## 10. Graph Rendering Conventions (T-035-F)

Derived from BACKEND.md "Open Questions for Frontend" section:

| Node type  | Shape       | Colour  | Label                               |
|------------|-------------|---------|-------------------------------------|
| `entity`   | Circle      | Purple  | `node.label` (truncated to 40 chars)|
| `chunk`    | Rectangle   | Teal    | First 50 chars of `node.label`      |

| Edge type      | Label colour |
|----------------|--------------|
| `mentions`     | Grey         |
| `similarity`   | Blue         |
| `co_occurrence`| Purple       |

---

## 11. Citation Confidence Colour Mapping (T-036-F)

| Confidence range | Badge colour | CSS class applied         |
|------------------|--------------|---------------------------|
| ≥ 0.7            | Green        | `bg-green-100 text-green-800` |
| 0.4 – 0.69       | Yellow       | `bg-yellow-100 text-yellow-800` |
| < 0.4            | Red          | `bg-red-100 text-red-800`  |

---

## 12. Tool Badge Colour Mapping (T-034-F)

| Tool name keyword | Badge variant | Tailwind classes              |
|-------------------|---------------|-------------------------------|
| `vector`          | Blue          | `bg-blue-100 text-blue-800`   |
| `sql`             | Green         | `bg-green-100 text-green-800` |
| `compute`         | Orange        | `bg-orange-100 text-orange-800` |
| (other)           | Default grey  | shadcn default `secondary`    |

---

## 13. Known Constraints

- **No streaming:** Backend returns full response in one HTTP call. ChatPanel shows a loading skeleton for the full duration (10–30s for hybrid queries).
- **Render cold start:** First request after 15 minutes of inactivity may take 30–50s. A "warming up" indicator should appear if the request exceeds 8 seconds.
- **React Flow:** Uses `@xyflow/react` (v12+). Node position layout uses the built-in `dagre` algorithm via `fitView`.
- **Markdown rendering:** Use `react-markdown` to render `answer` field. No custom plugins required.
- **No auth:** All API calls are unauthenticated. No Authorization headers needed.

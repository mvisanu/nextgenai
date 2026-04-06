# Claude Code Prompt: Obsidian LLM Wiki — NextGenAI Knowledge Base

> Based on Karpathy's LLM Wiki pattern (gist.github.com/karpathy/442a6bf555914893e9891c11519de94f)
> Vault structure: raw/ → wiki/ → output/ (three-layer Obsidian RAG diagram)
> Primary ingestion: Obsidian Web Clipper v1.3.0
> Project: NextGenAI — FastAPI + Next.js + Supabase + LightRAG + pgvector

---

## Context

- **Project**: NextGenAI agentic manufacturing intelligence platform
- **Live**: https://nextgenai-seven.vercel.app | API: https://nextgenai-5bf8.onrender.com
- **Stack**: FastAPI + Next.js 16 App Router + PostgreSQL/pgvector (Neon) + LightRAG + Supabase Auth
- **LLMs**: Claude Sonnet 4.6 (synthesis) + Haiku 4.5 (classify/plan/verify)
- **Existing**: 599 tests, 5 frontend pages, 15+ API endpoints, 8 DB tables, 5-wave release history
- **CLAUDE.md** is the authoritative codebase source of truth — the first ingest populates the wiki from it

---

## How documents enter the wiki

**Everything flows through Obsidian Web Clipper first.**

Install: https://chromewebstore.google.com/detail/obsidian-web-clipper/cnjifjpddelmedmihgijeibhnjfabmlf
Available for Chrome, Firefox, Safari, Edge, Brave, Arc.

The Web Clipper converts any web page — docs, GitHub pages, blog posts, API references,
research papers, release notes — into clean local Markdown and deposits it directly into
`vault/raw/`. Claude Code then runs an INGEST on whatever lands there.

```
Web Page
  → Obsidian Web Clipper (browser extension)
    → vault/raw/[subfolder]/clipped-file.md   (Markdown, local, offline)
      → Claude Code INGEST
        → vault/wiki/[subfolder]/             (compiled, cross-linked, maintained)
          → vault/output/                     (query results, reports, slide decks)
```

You never manually write wiki pages. The Clipper feeds raw/. Claude Code compiles wiki/.

---

## Step 1 — Install and configure Obsidian Web Clipper

### 1a — Install the extension

| Browser | Link |
|---|---|
| Chrome, Brave, Arc | https://chromewebstore.google.com/detail/obsidian-web-clipper/cnjifjpddelmedmihgijeibhnjfabmlf |
| Firefox | https://addons.mozilla.org/en-US/firefox/addon/web-clipper-obsidian/ |
| Safari (macOS/iOS) | https://apps.apple.com/us/app/obsidian-web-clipper/id6720708363 |
| Edge | https://microsoftedge.microsoft.com/addons/detail/obsidian-web-clipper/eigdjhmgnaaeaonimdklocfekkaanfme |

### 1b — Connect to your vault

1. Open the Web Clipper extension → Settings → **Vault**
2. Select your `vault/` directory (or the vault root if Obsidian is already open)
3. The extension will now save clipped files directly into the vault

### 1c — Set the default clip folder

In Web Clipper Settings → **Default folder**: set to `raw/articles/`

This is the catch-all. Articles, blog posts, anything without a specific rule lands here.
Template rules (Step 1d) will route specific content types to the right subfolders automatically.

### 1d — Create routing templates for NextGenAI content types

Templates let the Web Clipper extract structured metadata and route clips to the correct
`raw/` subfolder automatically based on the URL or content type.

Go to Web Clipper Settings → **Templates** → New template for each of the following:

---

**Template 1: GitHub — Code & Docs**
- Name: `GitHub Page`
- Trigger rule: URL contains `github.com`
- Folder: `raw/github/`
- Note name: `{{title}}`
- Content:
```
---
title: {{title}}
url: {{url}}
clipped: {{date}}
type: github
tags: github
---

{{content}}
```

---

**Template 2: FastAPI / Python Docs**
- Name: `API Docs`
- Trigger rule: URL contains `fastapi.tiangolo.com` OR `docs.python.org` OR `pydantic.dev`
- Folder: `raw/api-docs/`
- Note name: `{{title}}`
- Content:
```
---
title: {{title}}
url: {{url}}
clipped: {{date}}
type: api-docs
tags: backend, docs
---

{{content}}
```

---

**Template 3: Next.js / Vercel / React Docs**
- Name: `Frontend Docs`
- Trigger rule: URL contains `nextjs.org` OR `vercel.com/docs` OR `react.dev`
- Folder: `raw/frontend-docs/`
- Note name: `{{title}}`
- Content:
```
---
title: {{title}}
url: {{url}}
clipped: {{date}}
type: frontend-docs
tags: frontend, docs
---

{{content}}
```

---

**Template 4: Supabase Docs**
- Name: `Supabase`
- Trigger rule: URL contains `supabase.com`
- Folder: `raw/supabase/`
- Note name: `{{title}}`
- Content:
```
---
title: {{title}}
url: {{url}}
clipped: {{date}}
type: supabase
tags: auth, supabase
---

{{content}}
```

---

**Template 5: Anthropic / LLM Docs**
- Name: `Anthropic Docs`
- Trigger rule: URL contains `anthropic.com` OR `docs.anthropic.com`
- Folder: `raw/llm-docs/`
- Note name: `{{title}}`
- Content:
```
---
title: {{title}}
url: {{url}}
clipped: {{date}}
type: llm-docs
tags: llm, anthropic, claude
---

{{content}}
```

---

**Template 6: LightRAG / Research Papers**
- Name: `Research`
- Trigger rule: URL contains `arxiv.org` OR `github.com/HKUDS/LightRAG`
- Folder: `raw/research/`
- Note name: `{{title}}`
- Content:
```
---
title: {{title}}
url: {{url}}
clipped: {{date}}
type: research
tags: research, lightrag, rag
---

{{content}}
```

---

**Template 7: General Articles (default)**
- Name: `Article`
- Trigger rule: (none — this is the fallback)
- Folder: `raw/articles/`
- Note name: `{{title}}`
- Content:
```
---
title: {{title}}
url: {{url}}
author: {{author}}
clipped: {{date}}
tags: article
---

{{content}}
```

### 1e — Set up image downloading

1. In Obsidian → Settings → Files and links → set **Attachment folder path** to `raw/assets/`
2. In Obsidian → Settings → Hotkeys → search "Download" → bind
   **"Download attachments for current file"** to `Ctrl+Shift+D`

After clipping any article, hit `Ctrl+Shift+D` to pull all images to local disk.
This lets Claude Code reference images directly instead of relying on URLs that may break.

### 1f — Set up highlight saving

Web Clipper supports saving highlights from any page.
Select any important passage → right-click → **Save to Obsidian** → highlights are saved
inline in the clipped file with `==highlight==` markdown syntax.
When you clip GitHub issues, API changelogs, or release notes, highlight the key lines
before saving — Claude Code will find and prioritise highlighted content during INGEST.

### 1g — Set up the hotkey for instant clipping

Web Clipper Settings → **Hotkeys** → set a hotkey for "Clip current page" (e.g. `Ctrl+Shift+O`)
One keystroke from any page → Markdown in `raw/` → ready for INGEST.

---

## Step 2 — Scaffold the vault structure

Create the following directory and stub file skeleton.
Stub files get frontmatter + one-line Summary placeholder only — content added during INGEST.

```
vault/
│
├── raw/                                  ← YOUR inbox — Clipper deposits everything here
│   ├── articles/                         ← General web clips (default template)
│   ├── github/                           ← GitHub pages, issues, repos, READMEs
│   ├── api-docs/                         ← FastAPI, Pydantic, SQLAlchemy, pgvector docs
│   ├── frontend-docs/                    ← Next.js, Vercel, React, Tailwind docs
│   ├── supabase/                         ← Supabase auth, SSR, RLS, JWT docs
│   ├── llm-docs/                         ← Anthropic, Claude API, model docs
│   ├── research/                         ← LightRAG paper, RAG research, arxiv clips
│   ├── claude-md/                        ← Paste CLAUDE.md here as CLAUDE.md
│   ├── prd/                              ← prd2.md, prd3.md, tasks2.md, tasks3.md
│   ├── test-reports/                     ← TEST_REPORT.md, wave summaries
│   ├── upgrade-docs/                     ← upgrade.md, optimize.md, auth_prompt.md
│   └── assets/                           ← Images pulled down via Ctrl+Shift+D
│
├── wiki/                                 ← LLM's domain — Claude Code writes this
│   ├── _master-index.md                  ← LLM's table of contents
│   ├── _log.md                           ← Append-only activity log
│   ├── _overview.md                      ← High-level synthesis of entire project
│   │
│   ├── agent-pipeline/
│   │   ├── _index.md
│   │   ├── orchestrator.md
│   │   ├── intent-classification.md
│   │   ├── planner.md
│   │   ├── verifier.md
│   │   └── llm-routing.md
│   │
│   ├── rag-systems/
│   │   ├── _index.md
│   │   ├── vector-search.md
│   │   ├── lightrag-architecture.md
│   │   ├── lightrag-constraints.md       ← All ~15 LightRAG gotchas — never let this go stale
│   │   ├── graph-builder.md
│   │   └── chunking-embeddings.md
│   │
│   ├── frontend/
│   │   ├── _index.md
│   │   ├── chat-panel.md
│   │   ├── graph-viewer.md
│   │   ├── agent-timeline.md
│   │   ├── lightrag-graph-viewer.md
│   │   ├── app-header.md
│   │   └── routing-pages.md
│   │
│   ├── backend/
│   │   ├── _index.md
│   │   ├── api-endpoints.md
│   │   ├── tools.md
│   │   ├── sql-guardrails.md
│   │   ├── auth-wave4.md
│   │   └── database-schema.md
│   │
│   ├── waves/
│   │   ├── _index.md
│   │   ├── wave3-summary.md
│   │   ├── wave4-summary.md
│   │   └── wave5-lightrag.md
│   │
│   ├── constraints/
│   │   ├── _index.md
│   │   ├── critical-constraints.md
│   │   ├── known-bugs.md
│   │   └── env-vars.md
│   │
│   └── decisions/
│       ├── _index.md
│       ├── _template.md
│       └── adr-001-lightrag-file-storage.md
│
└── output/                               ← Query results and generated reports
    ├── query-results.md                  ← Filed-back Q&A answers (compounding loop)
    └── slide-decks/                      ← Marp-format presentations
```

---

## Step 3 — Create WIKI_SCHEMA.md at repo root

```markdown
# NextGenAI LLM Wiki — Schema

Claude Code maintains vault/wiki/. The human maintains vault/raw/.
vault/raw/ is populated exclusively by Obsidian Web Clipper + manual file drops.
Outputs go to vault/output/.
Read this file at the start of every wiki operation.

---

## How raw/ is populated

Everything in raw/ arrives via one of two paths:
1. Obsidian Web Clipper — browser extension clips web pages directly to raw/[subfolder]/
2. Manual drop — CLAUDE.md, PRDs, test reports, local files copied into raw/

Never generate or write raw/ files. Never modify them. They are immutable source of truth.
When new files appear in raw/, run an INGEST on them.

## Clipper templates and what they produce

| Template | Destination folder | Content type |
|---|---|---|
| GitHub Page | raw/github/ | Repos, issues, READMEs, changelogs |
| API Docs | raw/api-docs/ | FastAPI, Pydantic, pgvector, SQLAlchemy |
| Frontend Docs | raw/frontend-docs/ | Next.js, React, Vercel, Tailwind |
| Supabase | raw/supabase/ | Auth, SSR, RLS, JWT docs |
| Anthropic Docs | raw/llm-docs/ | Claude API, model docs, SDKs |
| Research | raw/research/ | LightRAG paper, arxiv, RAG research |
| Article (default) | raw/articles/ | Any other web content |

Clipped files include frontmatter: title, url, clipped date, tags.
Highlighted text from the clipper is preserved as ==highlight== markdown.
Claude Code should treat highlighted passages as high-priority content during INGEST.

---

## Page frontmatter (required on every wiki page)

---
title: [Page title]
type: [pipeline | rag | frontend | backend | wave | constraint | decision | note]
tags: [comma-separated]
sources: [raw/ files this page draws from — include URLs from clipped files]
last_updated: [YYYY-MM-DD]
related: [wikilinks to connected pages]
---

Sections on every page:
- ## Summary — 2–3 sentences
- ## Details — main content
- ## Constraints — "never do" rules specific to this area
- ## Related — [[wikilinks]] to connected pages
- ## Open Questions — gaps to research, pages to clip next

---

## _master-index.md format

One line per page:
[[page-path]] | type | one-line summary | last_updated

Sections: Agent Pipeline, RAG Systems, Frontend, Backend, Waves, Constraints, Decisions, Output.
Read _master-index.md first on every QUERY before drilling into pages.

## _index.md format (per subfolder)

Mini-catalog of pages in that folder only. Same format as _master-index.md but scoped.

## _log.md format (new entries at TOP)

## [YYYY-MM-DD] OPERATION | description
Operations: INGEST | QUERY | LINT | DECISION | BUG | CLIP

Example:
## [2026-04-05] CLIP | Supabase SSR auth docs — 3 pages clipped, ready to ingest
## [2026-04-05] INGEST | CLAUDE.md — initial project context (22 pages created)
## [2026-04-05] QUERY | How does domain session isolation work in ChatPanel?

## output/query-results.md format (new entries at TOP)

## [YYYY-MM-DD] Q: [question]
[synthesised answer with [[wikilinks]]]

---

## Operations

### INGEST
When new files appear in raw/ (via Clipper or manual drop):
1. Read the source file. Note whether it is a clipped file (has url: in frontmatter).
2. Prioritise ==highlighted== passages — these were marked as important by the human.
3. Identify content relevant to: pipeline, RAG, frontend, backend, constraints, decisions.
4. Create or update the relevant wiki pages in the appropriate subfolders.
5. For clipped docs: link the source URL in the wiki page's sources: frontmatter.
6. For CLAUDE.md ingests: touches nearly every subfolder — be thorough (18–22 pages).
7. Flag contradictions with existing wiki content as: > ⚠️ CONFLICT: [description]
8. Update the subfolder _index.md for every folder touched.
9. Update _master-index.md.
10. Append INGEST entry to _log.md (include page count created/updated).

### CLIP-AND-INGEST (most common workflow)
When the human says "I just clipped [page/topic], ingest it":
1. Find the new file(s) in raw/ — check the clipped date to identify what's new.
2. Run a full INGEST on the new file(s) as above.
3. After ingest, check Open Questions in relevant wiki pages — suggest 2–3 more pages
   for the human to clip next to fill gaps.

### QUERY
When asked a question about the codebase or architecture:
1. Read _master-index.md to find relevant pages.
2. If domain-specific, read the subfolder _index.md first.
3. Read relevant pages.
4. Synthesise answer with [[wikilinks]] inline.
5. If the answer is non-trivial, file it to output/query-results.md.
6. Append QUERY entry to _log.md.
7. Suggest 1–2 pages the human could clip next to enrich the answer further.

### LINT
When asked for a health check:
- Stubs in _master-index.md with no Details content yet
- Constraints in CLAUDE.md not yet in constraints/critical-constraints.md
- Contradictions between wiki pages
- Orphan pages with no inbound [[wikilinks]]
- LightRAG gotchas not in rag-systems/lightrag-constraints.md
- Wave constraints not in the corresponding wave summary
- Open Questions answerable from existing raw/ files
- raw/ files clipped but not yet ingested (check clipped dates vs _log.md)

Output: numbered issue list + 3–5 clip suggestions for the human.
Append LINT entry to _log.md.

### SUGGEST-CLIPS
When asked "what should I clip next?":
Read all Open Questions sections across wiki pages.
Group by theme. Return a prioritised list of:
- What to search/find
- Suggested URL or source to clip
- Which wiki page it would enrich
- Why it matters for the project

This is how the wiki grows intelligently — not randomly, but targeted gap-filling.

### DECISION
When an architecture decision is being made:
1. Use decisions/_template.md.
2. File as decisions/[slug].md.
3. Update decisions/_index.md and _master-index.md.
4. Link from affected component pages.
5. Append DECISION entry to _log.md.

---

## NextGenAI clip priorities (what to clip first)

These are the highest-value external docs for this codebase.
Clip these early to give Claude Code context beyond CLAUDE.md:

Priority 1 — Foundation docs (clip these first)
- https://github.com/HKUDS/LightRAG — LightRAG repo README and issues
- https://docs.anthropic.com/en/api/messages — Claude Messages API
- https://supabase.com/docs/guides/auth/server-side/nextjs — Supabase SSR auth
- https://fastapi.tiangolo.com/async/ — FastAPI async docs

Priority 2 — Constraint-rich docs (clip to fill known gaps)
- https://react.dev/reference/react/useMemo — useMemo (GraphViewer constraint)
- https://docs.anthropic.com/en/api/streaming — Claude streaming (SSE synthesis)
- https://orm.drizzle.team or SQLAlchemy async docs — DB async patterns
- pgvector GitHub README — HNSW index constraints

Priority 3 — Wave-relevant external content
- Supabase changelog — any auth or SSR changes post Wave 4
- Next.js 16 release notes — App Router changes affecting routing-pages.md
- LightRAG GitHub issues — known bugs relevant to Wave 5 constraints

---

## NextGenAI-specific INGEST conventions

### LightRAG files from raw/research/ or raw/github/
When clipped LightRAG docs arrive:
- Cross-reference against rag-systems/lightrag-constraints.md
- Any new constraint discovered from official docs overrides inferred constraints
- Always check: does this contradict or confirm an existing constraint?

### Auth files from raw/supabase/
When Supabase docs are clipped:
- Update backend/auth-wave4.md Constraints section
- Check for any changes to createServerClient, getUser() vs getSession() guidance
- Security constraints are never overridden silently — flag as ⚠️ CONFLICT if docs change

### Clipped articles from raw/articles/
- Check the ==highlights== first — only compile highlighted content unless the full article is short
- File to the most relevant wiki subfolder based on content, not just source URL

### CR-007 rule
CR-007 (asyncio.get_running_loop() constraint) must always appear in backend/tools.md.
If any clipped Python docs suggest a different pattern, flag as ⚠️ CONFLICT — do not silently override.

### Known bugs rule
Any clipped GitHub issue, release note, or changelog that documents a bug affecting
this codebase must be added to constraints/known-bugs.md immediately.
```

---

## Step 4 — Create ADR template

Create `vault/wiki/decisions/_template.md`:

```markdown
---
title: ADR — [short title]
type: decision
tags: []
sources: []
last_updated: YYYY-MM-DD
related: []
---

## Summary
One sentence: what was decided and why.

## Status
[ ] Proposed  [ ] Accepted  [ ] Superseded  [ ] Deprecated

## Context
What problem? What constraints existed? Were any external docs clipped to inform this?

## Decision
Specific: file paths, patterns, library choices, version numbers.

## Consequences
Easier / harder. New constraints introduced.

## Constraints introduced
List "never do" rules from this decision.
Add these to constraints/critical-constraints.md.

## Clip sources
URLs of any web pages clipped to inform this decision.

## Related
[[wikilinks]] to affected components and prior decisions.
```

---

## Step 5 — First INGEST: CLAUDE.md

Copy the repo `CLAUDE.md` to `vault/raw/claude-md/CLAUDE.md`.
Then run a full INGEST. This creates the initial wiki baseline.

This ingest must create or populate all of the following pages:

**agent-pipeline/**: orchestrator.md, intent-classification.md, planner.md, verifier.md (max_tokens=1536 constraint), llm-routing.md (Haiku vs Sonnet rules)

**rag-systems/**: vector-search.md (HNSW, BM25, hybrid RRF, char offsets), lightrag-architecture.md (Wave 5 design), lightrag-constraints.md (ALL ~15 gotchas — EmbeddingFunc dataclass, working_dir not workspace, ssr:false, _graph_stats cache, system= kwarg not user message, "" on empty index), graph-builder.md (3-tier priority), chunking-embeddings.md (MiniLM, 384 dims)

**frontend/**: chat-panel.md (SSE, 3-ref domain isolation, retry 3×/4s, examples bridge), graph-viewer.md (useMemo constraint, 3-tier, synthetic grid), agent-timeline.md (accordion, score normalisation), lightrag-graph-viewer.md (dynamic ssr:false — mandatory), app-header.md (46px, no duplicate headers), routing-pages.md (Suspense pattern, height calc)

**backend/**: api-endpoints.md (full table + auth posture), tools.md (CR-007 asyncio), sql-guardrails.md (SELECT-only), auth-wave4.md (SUPABASE_JWT_SECRET backend-only, get_optional_user vs get_current_user), database-schema.md (8 tables, Alembic CONCURRENTLY pattern)

**waves/**: wave3-summary.md, wave4-summary.md, wave5-lightrag.md (all constraints)

**constraints/**: critical-constraints.md (full "never do" checklist), known-bugs.md (BUG-W3-P3-001), env-vars.md (full table)

After ingest: update all subfolder _index.md files, update _master-index.md, append INGEST entry to _log.md.

---

## Step 6 — Obsidian setup checklist

After vault scaffolded and CLAUDE.md ingested:

- [ ] Open Obsidian → Open folder as vault → select `vault/`
- [ ] Settings → Files and links → Attachment folder: `raw/assets/`
- [ ] Settings → Hotkeys → "Download attachments for current file" → `Ctrl+Shift+D`
- [ ] Settings → Hotkeys → Web Clipper "Clip current page" → `Ctrl+Shift+O`
- [ ] Install plugin: **Dataview** (query frontmatter — e.g. all pages with type: constraint)
- [ ] Install plugin: **Marp** (render slide decks from wiki content)
- [ ] Open Graph View — orphan nodes = pages to link (lint target)
- [ ] Web Clipper installed in browser with all 7 templates configured (Step 1d)
- [ ] Web Clipper default folder set to `raw/articles/`
- [ ] Test: clip one page → verify it lands in the correct raw/ subfolder with clean frontmatter

---

## Acceptance criteria

- [ ] Full vault/ structure created with all stub files
- [ ] WIKI_SCHEMA.md created at repo root
- [ ] vault/wiki/decisions/_template.md created
- [ ] _master-index.md initialised with all stub entries
- [ ] _log.md initialised with scaffold entry
- [ ] Each subfolder has its own _index.md
- [ ] All 7 Web Clipper templates created and routing correctly
- [ ] Web Clipper default folder set to raw/articles/
- [ ] Image hotkey bound (Ctrl+Shift+D → raw/assets/)
- [ ] CLAUDE.md ingest completed — 22 pages written (not stubs)
- [ ] All ~15 LightRAG gotchas in rag-systems/lightrag-constraints.md
- [ ] All Wave 4 auth security constraints in backend/auth-wave4.md Constraints section
- [ ] CR-007 in backend/tools.md Constraints section
- [ ] constraints/critical-constraints.md contains full Key Constraints checklist
- [ ] BUG-W3-P3-001 in constraints/known-bugs.md
- [ ] output/query-results.md exists and ready
- [ ] Obsidian graph view shows no isolated orphan nodes

---

## The daily workflow

```
Morning:
  Browse docs, GitHub issues, release notes, articles relevant to the sprint
  → Ctrl+Shift+O on anything useful
  → Files land in raw/[correct subfolder]/ automatically via template rules

Before coding:
  Tell Claude Code: "New clips in raw/ — ingest them"
  → Claude Code reads, compiles, cross-references, updates wiki pages
  → Ask follow-up questions against the updated wiki

During coding:
  Ask Claude Code anything:
    "What LightRAG constraints apply to this new endpoint?"
    "What env vars do I need to add for this feature?"
    "What changed in ChatPanel that affects domain isolation here?"
  → Answers filed back to output/query-results.md

Weekly:
  Tell Claude Code: "Run a lint check"
  → Get list of stale pages, missing constraints, orphaned notes
  → Get clip suggestions for next week's gaps
```

---

## Example queries to run after setup

These verify the wiki is working and start the compounding loop.
Each good answer gets filed to output/query-results.md.

- "What breaks if I change GraphViewer.tsx?"
- "What are all constraints for adding a new LightRAG endpoint?"
- "What is the difference between get_optional_user and get_current_user and when do I use each?"
- "What Alembic migration rules must I follow for a new Wave 6 column?"
- "What are all env vars needed for a fresh Render deployment?"
- "How does domain session isolation work — what are the three refs?"
- "What changed in ChatPanel between Wave 3 and Wave 5?"
- "What should I clip next to fill the Open Questions in lightrag-constraints.md?"

That last question type is the key one — it turns the wiki into a self-directing research system.
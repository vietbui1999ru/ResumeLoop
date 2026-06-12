---
title: "Architecture"
type: explanation
description: "System design, data flow, key files, and design decisions behind local-first ResumeLoop."
tags: [architecture, data-flow, design, local-first]
updated: 2026-06-12
---

# Architecture

ResumeLoop is a **local-first, single-user** Next.js App Router application. It binds to `127.0.0.1`, stores data as plain files the user owns, and uses the user's own AI **CLI** as the generation brain. There are no accounts, no API keys, and no cloud backend.

> **Migration note.** This document describes the architecture of record ([ADR 0001](adr/0001-pivot-to-local-first.md)). The prior cloud build (AWS ECS + Neon + NextAuth) is frozen on `legacy/cloud-v1` / tag `v1.0-cloud-final`. Some modules still contain cloud-era code being removed; where a file disagrees with this doc, the doc is the target. The provider **spine** (`lib/providers/`) is the landed tracer bullet proving the model end-to-end.

---

## The three seams

Everything in ResumeLoop hangs off three seams. Understand these and the rest follows.

1. **Brain** — `lib/providers/`: the only place the system talks to an AI. A provider adapter shells out to the user's CLI (or an `http` endpoint) and enforces a structured-output contract.
2. **State** — the user's `data/` workspace is canonical; `.cache/index.db` is a rebuildable SQLite index over it.
3. **Engine** — `pipeline/buildv2.js` + a Playwright PDF template turn an AI decision into an ATS `.docx` and a polished `.pdf`, under strict validation.

---

## Brain: the provider adapter

ResumeLoop never imports a model SDK in application code. Instead, `lib/providers/` exposes one seam:

```
ProviderAdapter.runStructured(schema, prompt, opts)
        │
        │  build prompt: instruction + shapeHint + "return one ```json block"
        ▼
   CliRunner(prompt)            ← transport: spawn CLI or POST http
        │  claude -p --output-format json | codex exec | gemini -p | opencode run | http
        ▼
   raw stdout
        │  extractLastJsonBlock()       ← lib/providers/extract-json.ts
        ▼
   JSON.parse → schema.parse (Zod)
        │  on failure: retry ONCE, appending the validation error to the prompt
        ▼
   validated T
```

- **`types.ts`** — `CliRunner` (a `(prompt, opts) => Promise<string>` transport) and `ProviderAdapter` (the `runStructured<T>` contract). The runner is injected, so the adapter is unit-testable with a fake.
- **`adapter.ts`** — the universal adapter: fenced-JSON instruction, last-block extraction, Zod validation, one retry.
- **`claude.ts`** — the Claude Code runner. Runs `claude` in headless print mode and unwraps the JSON envelope's `.result` as a native fast-path; falls back to the universal fenced-JSON path otherwise.
- **`extract-json.ts`** — pulls the last ` ```json ` fenced block out of CLI stdout (CLIs often print prose around the JSON).
- **`spine.ts`** — the domain entry points: `decideForJob(jdText, masterData, runner)` returns a Zod-validated `SpineDecision`; `renderDocxBuffer(decision, masterData)` renders it to a `.docx` buffer.

The hosted demo and a local ollama both ride the same adapter via the `http` transport — there is exactly one brain seam to test and reason about.

### SpineDecision

The brain returns a single structured object per JD (`SpineDecisionSchema` in `spine.ts`):

```ts
{
  fitPct:      number,        // 0–100
  fitNote:     string,        // one sentence
  track:       string,        // role-track label
  workVariant: 'genai' | 'systems' | 'fullstack' | 'sre' | 'IT-track',
  workIds:     string[],      // 3 work entry ids
  projects:    string[],      // 3 project ids
  tagline:     string,        // ≤76 chars
  skillsRows:  string[],      // "Label: a · b · c", 3–5 rows
}
```

---

## State: files canonical, DB is a cache

```
data/                     ← the user's workspace (git-trackable, authoritative)
  profile.json              resume content: experience[], projects[], skills{}, contact
  jobs/*.md                 JD body + frontmatter (Action 0–6, visa, apply_url, clipped_at, tags)
  evaluations/*.md          fit %, score, outreach brief
  resumes/                  generated .docx / .pdf

.cache/
  index.db                  SQLite index over data/ — for fast filtering & funnel metrics
```

The database is a **cache**, not the source of truth:

- **Files are authoritative** for all content: profile, job text, tags, visa language, pipeline stage.
- **The index is the query layer**: fast filtering, aggregation, and funnel metrics over hundreds of jobs without re-parsing every file.
- **Writes go to files first.** A pipeline-stage change writes the job's `.md` frontmatter, then updates the index. A crash between the two is safe — the next scan re-reads the correct value.
- **Resetting the index loses nothing.** Delete `.cache/index.db`; a rescan reconstructs it from `data/`.

There is no `user_id`, no multi-tenant filtering, no encrypted key store — there is one user and no keys.

---

## Data flows

### Onboarding (two phases)

```
phase 1 — deterministic (no brain required)
  detect installed CLIs (which claude codex gemini opencode)
    → user picks provider → validate with a test spawn → capture name/targets
    → write provider choice + skeleton to data/

phase 2 — AI ingestion (needs a working brain)
  user input (paste CV / GitHub handle / portfolio URL)
        │  lib/ingest/extract-{paste,github,url}.ts  (provider adapter, structured)
        ▼  SparseProfile (only fields found in the input)
  merge: lib/ingest/merge.ts  → most-specific-wins + conflict flags
        ▼
  user confirms → data/profile.json
```

### Job intake / scan (write)

```
Obsidian clip / paste JD / drop .md   → data/jobs/*.md
        │  POST /api/batch/scan
        ▼
   jd-parser.ts     parse frontmatter → company, role_title, tags, visa_status, clipped_at
   fit-scorer.ts    assign role_track + fit_pct (via provider adapter)
        │  upsert into the index (skip unchanged: file_mtime matches AND clipped_at non-null)
        ▼
   index.db         the query layer
```

### Generation

```
selected job(s)
        │  POST /api/generate
        ▼
   generate-pipeline.ts          streams SSE events per stage
        ├── read profile          data/profile.json (fallback: pipeline/master_resume_data.json)
        ├── decide                lib/providers/spine.decideForJob() → SpineDecision (Zod-validated)
        ├── build                 buildv2.js → DOCX (T()/TL() enforce ≤116 / ≤76 on word boundary)
        ├── validate              verb-uniqueness, em-dash ban, 1-page paragraph budget
        ├── pdf                   Playwright HTML→PDF template (non-fatal)
        └── finalize              write data/resumes/*.docx + *.pdf, update index, tag the JD file
```

### Query (read)

```
SQLite index
        │  GET /api/jobs, /api/metrics, /api/jobs/[id]
        ▼
   Next.js API routes → React client components
```

No file I/O on the read path — the UI stays fast even with 500+ jobs.

---

## Trust boundary (no auth)

The app binds to `127.0.0.1` and is single-user. **The OS account is the trust boundary.** There is no NextAuth, no session/JWT layer, no per-route auth guard, and no `user_id` scoping. These were part of the multi-tenant cloud build and are removed.

If the app is ever exposed beyond localhost (e.g. the hosted demo), that is handled at the edge — a reverse proxy with rate-limiting — not by reintroducing in-app auth. The demo additionally runs anonymous, ephemeral sessions with no PII.

---

## Generation engine (no LibreOffice)

- **ATS `.docx`** is produced by `pipeline/buildv2.js` using the pure-JS `docx` package. `T()` and `TL()` truncate bullets (≤116) and the tagline (≤76) on a word boundary using the limits in `lib/config.ts`.
- **Polished `.pdf`** is produced by an HTML→PDF Playwright template (headless Chromium, auto-installed ~150 MB on first run).
- **LibreOffice is gone** — it was a ~400 MB system dependency that broke the local-install story (ADR 0001 §5).

---

## Interfaces share one core

The web app and the optional **Ink TUI** share the same Zod schemas, TypeScript types, and file/index layer. The TUI is not a parallel implementation — it is a second front-end over the same `lib/`:

- **Web** (Next.js, `127.0.0.1`) — full editing: jobs, chat/bullets editor, profile, settings.
- **TUI** (Ink, optional) — onboarding Q&A, a read-only pipeline dashboard, and quick status bumps.

---

## Key Files

| File | Role |
|---|---|
| `lib/providers/types.ts` | `CliRunner` + `ProviderAdapter` contracts |
| `lib/providers/adapter.ts` | Universal fenced-JSON + Zod-validate + one-retry adapter |
| `lib/providers/claude.ts` | `claude -p --output-format json` runner (envelope `.result` fast-path) |
| `lib/providers/extract-json.ts` | Extract last fenced JSON block from CLI stdout |
| `lib/providers/spine.ts` | `decideForJob()` + `renderDocxBuffer()`; `SpineDecisionSchema` |
| `lib/db.ts` | SQLite index connection (WAL), `initSchema`, numbered migrations |
| `lib/db-adapter.ts` | `DbAdapter` interface, `SqliteAdapter`, `getAdapter()` |
| `lib/generate-pipeline.ts` | End-to-end generation pipeline (SSE streaming) |
| `lib/jd-parser.ts` | Frontmatter parser: company, role_title, tags, visa_status, clipped_at |
| `lib/fit-scorer.ts` | `role_track` + `fit_pct` scoring |
| `lib/config.ts` | Char limits, word-boundary mins, UI timing constants |
| `lib/ingest/extract-{paste,github,url}.ts` | Source → provider adapter → `SparseProfile` |
| `lib/ingest/merge.ts` | `SparseProfile[]` → `MergeResult` (most-specific-wins + conflicts) |
| `pipeline/master_resume_data.json` | Engine data **shape** / bootstrap template |
| `pipeline/buildv2.js` | DOCX generation engine (`T()`/`TL()` gates) |
| `data/profile.json` | Runtime resume content (source of truth) |
| `.cache/index.db` | Rebuildable SQLite index over `data/` |

---

## Directory structure

```
app/
├── api/                  Local REST routes (no auth)
│   ├── batch/scan/       POST — scan jobs/ folder into the index
│   ├── generate/         POST — start generation; SSE stream
│   ├── jobs/             GET list; PATCH action; GET/stream output
│   ├── jobs/[id]/
│   │   ├── cover-letter/ streaming cover letter
│   │   └── outreach/     outreach items CRUD + AI drafts
│   ├── ingest/           Onboarding ingestion (paste/github/url/merge/sources)
│   ├── chat/             streaming chat + profile apply
│   ├── sessions/         resume session CRUD
│   ├── settings/         workspace paths + provider config
│   └── metrics/          aggregated dashboard stats
├── (app)/                pages: onboarding · jobs · chat · profile · settings
└── …

lib/
├── providers/            BRAIN seam — CLI/http adapter + spine
├── ingest/               onboarding ingestion (extract → merge)
└── …                     business logic (no React)

pipeline/
├── master_resume_data.json   engine data shape / template
└── buildv2.js                DOCX engine

tui/                      optional Ink terminal UI (shares lib/ + schemas)
data/                     user workspace (profile.json, jobs/, evaluations/, resumes/)
docs/
└── legacy/               archived cloud-era operational docs
```

---

## Related pages

- [`CONTEXT.md`](../CONTEXT.md) — shared vocabulary + invariants
- [`TLDR.md`](../TLDR.md) — one-screen overview
- [`docs/adr/0001-pivot-to-local-first.md`](adr/0001-pivot-to-local-first.md) — the pivot decision of record
- [`DEPRECATED.md`](../DEPRECATED.md) — cloud → local-first change table
- [`docs/legacy/`](legacy/) — archived cloud-era deploy / AWS / observability docs

---
title: "Architecture"
type: explanation
description: "System design, data flow, key files, and design decisions behind ResumeAnalyze."
tags: [architecture, data-flow, design]
updated: 2026-05-11
---

# Architecture

ResumeAnalyze is a Next.js 14 App Router application. It operates in two modes determined by the `APP_MODE` environment variable:

- **Local** (`APP_MODE` unset) — SQLite database (`resume.db`), local filesystem for file I/O
- **Cloud** (`APP_MODE=cloud`) — Neon serverless Postgres, S3 for file storage

Both modes share the same application code. The `DbAdapter` interface (`lib/db-adapter.ts`) abstracts the difference.

---

## Data Flow

### Scan path (write)

```
Obsidian vault (.md files)
        │
        │  POST /api/batch/scan
        ▼
   jd-parser.ts          ← parse frontmatter → company, role_title, tags,
                            visa_status, clipped_at
   fit-scorer.ts         ← assign role_track + fit_pct
        │
        │  upsert (skip unchanged by file_mtime)
        ▼
   jd_jobs table         ← source of truth for the query path
```

Incremental: files are skipped if `file_mtime` has not changed since the last scan.

### Generation path

```
jd_jobs row
        │
        │  POST /api/generate (select job IDs)
        ▼
   generate-pipeline.ts  ← streams SSE events per stage
        │
        ├── preflight     copy master_resume_data.json + buildv2.js, install deps
        ├── ai-reason     LLM selects: track, work IDs, project IDs, tagline, skills, reasoning
        ├── write-script  emit Node.js build script
        ├── build         run buildv2.js → DOCX
        ├── validate      check hard limits (tagline ≤76, bullets ≤116)
        ├── fix-loop      auto-fix tagline overruns; retry up to 3×
        ├── pdf           DOCX → PDF (non-fatal)
        └── finalize      move outputs, write jd_outputs row, tag JD file
```

### Query path (read)

```
SQLite / Neon
        │
        │  GET /api/jobs, /api/metrics, /api/jobs/[id]
        ▼
   Next.js API routes → React client components
```

No file I/O on the read path — keeps the UI fast even with 500+ JD files.

---

## Auth

NextAuth v5 with credentials provider. All API routes call `auth()` and gate on `session.user.id`. Every data table has a `user_id` column; all queries are scoped to the authenticated user.

A demo account (`demo@demo.com` / `demo`) is seeded automatically on first startup (local mode only).

---

## AI Layer

`lib/ai-client.ts` exposes `getModel(userId)` which reads the user's active provider + model from `user_settings` and returns a Vercel AI SDK `LanguageModel`. Application code (generate pipeline, cover letter, chat) does not branch on provider.

Supported providers: Anthropic, OpenAI, Google Gemini, Groq, OpenRouter, Ollama.

Chat requires Anthropic (uses tool-use streaming which is Anthropic-specific in the current implementation).

---

## Source of Truth: `.md` Files vs. Database

The database is a **cache**, not the source of truth.

- **`.md` files are authoritative** for all content: job text, tags, visa language, and pipeline stage.
- **Database is the query layer**: enables fast filtering, aggregation, and Sankey metrics without re-parsing every file.
- **Action writes go to `.md` first.** `PATCH /api/jobs/[id]/action` writes the frontmatter before updating the database. A crash after the file write but before the SQL update is safe — the next Scan re-reads the correct value.
- **Resetting the DB loses nothing.** All data can be reconstructed from the `.md` folder via Scan.

---

## Key Files

| File | Role |
|---|---|
| `lib/db.ts` | SQLite connection (WAL mode), `initSchema`, migration guards |
| `lib/db-adapter.ts` | `DbAdapter` interface, `SqliteAdapter`, `NeonAdapter`, `getAdapter()` |
| `lib/auth.ts` / `lib/auth.config.ts` | NextAuth configuration |
| `lib/ai-client.ts` | `getModel(userId)` — resolves Vercel AI SDK `LanguageModel` |
| `lib/ai-usage.ts` | Token usage logging per feature call |
| `lib/generate-pipeline.ts` | End-to-end resume generation pipeline (SSE streaming) |
| `lib/jd-parser.ts` | Frontmatter parser: company, role_title, tags, visa_status, clipped_at |
| `lib/fit-scorer.ts` | `role_track` + `fit_pct` scoring |
| `lib/sessions.ts` | CRUD for `resume_sessions` |
| `lib/cover-letter.ts` | Streaming cover letter generation |
| `lib/outreach.ts` | Outreach contact CRUD, AI card generation, email/LinkedIn draft generation |
| `lib/settings.ts` | `app_settings` read/write; path validation |
| `lib/crypto.ts` | AES-256 encryption for stored API keys |
| `lib/actions.ts` | Canonical `ActionStage` values |
| `master_resume_data.json` | All bullets, projects, work experience, skills — single source of truth |
| `buildv2.js` | DOCX generation engine |
| `harness/validate.js` | Hard-limit checker (tagline ≤76, bullets ≤116) |

---

## Directory Structure

```
app/
├── api/                  API routes (Next.js App Router)
│   ├── batch/scan/       POST — scan JD folder
│   ├── generate/         POST — start generation; SSE stream
│   ├── jobs/             GET list; PATCH action; GET/stream output
│   ├── jobs/[id]/
│   │   ├── cover-letter/ streaming cover letter
│   │   └── outreach/     outreach items CRUD + AI drafts
│   ├── chat/             streaming chat + profile apply
│   ├── sessions/         CRUD for resume sessions
│   ├── settings/         folder paths + AI provider config
│   ├── metrics/          aggregated dashboard stats
│   ├── github/           GitHub repo ingestion
│   └── auth/             NextAuth handlers
├── jobs/                 Jobs list page
├── settings/             Settings page
├── chat/                 Chat + GitHub ingestion page
└── auth/                 Sign in / sign up pages

lib/                      Business logic (no React)
components/               Client components
docs/                     Documentation
infra/                    AWS CDK / Terraform infra
```

---

## Related Pages

- [`docs/database.md`](database.md) — full schema reference
- [`docs/ai-providers.md`](ai-providers.md) — per-provider configuration
- [`docs/deploy.md`](deploy.md) — Docker and AWS deployment

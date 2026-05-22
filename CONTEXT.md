# CONTEXT.md — ResumeLoop

Shared vocabulary and architectural invariants. Read this before any non-trivial task.

## What this app does

ResumeLoop is a job-application automation tool. Given an Obsidian-clipped job description markdown file, it produces a tailored ATS-optimised 1-page DOCX resume, an AI fit assessment, and outreach drafts (LinkedIn + email). The web app is the pipeline — it is not a tracking layer on top of a separate pipeline.

## Candidate profile (sourced from active resume profile in DB)

Candidate data (name, work auth, contact, experience, projects, skills) is stored in the active `resume_profiles` row for the authenticated user. The disk file `pipeline/master_resume_data.json` is the bootstrap template only.

- **Visa kill rule:** "US Citizen/GC only", "no sponsorship", "must be US citizen", "US person", "export control" → tag `visa-kill`, stop. "Authorised to work in US", EEO boilerplate → proceed.

## Hard limits (non-negotiable, enforced by `validate.js`)

| Constraint | Value |
|---|---|
| Bullet max chars | 116 |
| Tagline max chars | 76 |
| Project header max chars | 116 |
| Work entries per resume | 3 (5 bullets each) |
| Project entries per resume | 3 (3 bullets each) |
| Skills rows | 5 |
| Total bullet paragraphs (1-page fit) | 44 |

## Domain vocabulary

**role-track** — one of the role categories in `CLAUDE.md`'s Role-Track table (e.g. `iOS Engineer`, `Backend / API Engineer`, `SRE / DevOps Engineer`). Determines which work variant and projects are selected.

**work variant** — `genai` | `systems` | `IT-track`. Selects which bullet set from `master_resume_data.json`'s `experience[].bullets` map.

**visa_status** — `proceed` | `kill` | `unknown`. Set by `lib/jd-parser.ts`. Never manually overridden.

**action** — the job's pipeline stage. Valid values defined in `lib/actions.ts`: `0-Saved`, `1-Applied`, `2-Phone Screen`, `3-Interview`, `4-Offer`, `5-Rejected`, `6-Ghosted`. Sourced from frontmatter `Action:` field; preserved across rescans (`COALESCE(excluded.action, jd_jobs.action)`).

**clipped_at** — ISO datetime from Obsidian frontmatter `created` / `date` / `clipped` field. Represents when the job was saved to the vault, not when it was scanned.

**apply_url** — application link, sourced from frontmatter `source` field or manually set via the UI. User edits win over rescans (`COALESCE(jd_jobs.apply_url, excluded.apply_url)`).

**hidden** — `0` | `1`. Jobs with `hidden=1` are excluded from the default list view.

**resume profile** — a named variant of `master_resume_data.json` stored in the `resume_profiles` DB table. One profile is `is_active=1` per user. The generation pipeline uses the active profile; falls back to the disk file if no profile exists.

**session** — a `resume_sessions` row holding the resume data string used for a generation run. Seeded from the active profile on first creation. Can be modified interactively via Chat.

**fit_pct** — 0–100 integer score from `lib/fit-scorer.ts`. Not a hard gate — low scores are flagged but resume is still generated.

**outreach_brief** — AI-generated markdown summary of networking context for a job (company research, culture signals, alumni). Stored on `jd_jobs`.

## Architectural invariants

### Multi-tenancy
Every table with user data has a `user_id TEXT NOT NULL DEFAULT 'default'` column. Every query **must** filter by `user_id`. No cross-user data leaks are acceptable. The demo user is `user_id = 'demo-user'`, `email = 'demo@demo.com'`.

### DB adapter pattern
All DB access goes through `DbAdapter` (`lib/db-adapter.ts`). Never import `getDb()` directly in API routes — use `getAdapter()`. This enables SQLite (local) ↔ Neon Postgres (cloud) switching via `isCloud()`.

### Generation pipeline contract
The pipeline (`lib/generate-pipeline.ts`) takes a `jobId` + `userId`, fetches the active resume profile from DB (fallback: disk), runs AI reasoning, writes a Node.js build script, executes it via `child_process.spawn`, and validates the DOCX output. Generated scripts carry all metadata inline (work title/company/location/dates, project name/url/stack/date).

### Scan incremental skip rule
A file is skipped during scan only if **both** `file_mtime` matches the stored value **and** `clipped_at` is non-null. This prevents rows with null `clipped_at` from being permanently skipped after a schema migration.

### Auth
NextAuth v5 (`lib/auth.ts`). Every API route except `/api/auth/*` and `/api/health` must call `auth()` and return 401 if `session?.user?.id` is absent. Middleware also blocks unauthenticated access as a second layer.

### Caching
`computeMetrics` uses `unstable_cache` with tag `metrics-${userId}` and 60s TTL. The scan route calls `revalidateTag(`metrics-${userId}`)` after upserts. No other routes use Next.js data cache — add conservatively.

### Config files (pipeline docs)
`pipeline/master_resume_data.json` — seeded from the user's active DB profile at session creation. The disk file is the bootstrap source; DB profiles are the runtime source.

`pipeline/buildv2.js` — server-executed Node script. **Not writable via HTTP.** Excluded from the config write allowlist.

The four markdown reference docs (`ats-optimization-guidelines.md`, `CLAUDE-full.md`, `ats-optimized-resume-system.md`, `spec-job-match-resume-generator.md`) are writable via the config API and injected into every AI reasoning call.

## Key file map

| Path | Role |
|---|---|
| `lib/jd-parser.ts` | Parses JD markdown → `JdJob` (visa, action, clipped_at, apply_url, tags) |
| `lib/fit-scorer.ts` | Scores JD content → role_track + fit_pct |
| `lib/ai-reason.ts` | AI reasoning: picks work IDs, projects, bullets, tagline |
| `lib/generate-pipeline.ts` | Orchestrates the full generation: preflight → AI → build script → validate → PDF → DB |
| `lib/db-adapter.ts` | DbAdapter interface + SQLite/Neon implementations |
| `lib/db.ts` | SQLite schema, migrations, global singleton |
| `lib/sessions.ts` | Resume session CRUD; default session seeded from active profile |
| `lib/settings.ts` | `getSetting` / `setSetting` for `app_settings` table |
| `lib/crypto.ts` | AES-256-GCM encrypt/decrypt for API key storage |
| `app/api/batch/scan/route.ts` | Incremental JD scan + upsert |
| `app/api/profiles/route.ts` | Resume profile CRUD |
| `app/api/generate/[jobId]/stream/route.ts` | SSE stream for generation progress |
| `harness/batch-build/` | Working directory for Node build script execution |
| `pipeline/` | `master_resume_data.json` + `buildv2.js` (bootstrap copies) |

## Slop Register

Known AI failure patterns for this codebase: see `.claude/slop-register.md`.
Read this before generating any code.

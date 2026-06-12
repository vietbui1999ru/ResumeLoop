# CONTEXT.md — ResumeLoop

Shared vocabulary and architectural invariants. Read this before any non-trivial task.

> **Direction of record.** ResumeLoop is a **local-first, bring-your-own-AI, single-user** tool. The architecture below reflects [ADR 0001](docs/adr/0001-pivot-to-local-first.md). The prior cloud/multi-tenant architecture is frozen on `legacy/cloud-v1` (tag `v1.0-cloud-final`); see [`DEPRECATED.md`](DEPRECATED.md). Some modules still carry cloud-era code mid-migration — when a file contradicts an invariant here, the invariant is the target and the file is the work item.

## What this app does

ResumeLoop turns a job description into a tailored ATS-optimised 1-page DOCX resume, an AI fit assessment, and outreach drafts (LinkedIn + email). It runs entirely on the user's machine, bound to `127.0.0.1`. The "brain" is the user's own AI **CLI** (`claude` / `codex` / `gemini` / `opencode`) or a local OpenAI-compatible endpoint — never a stored API key. The web app (and optional Ink TUI) is the pipeline; it is not a tracking layer on top of a separate pipeline.

## Candidate profile (lives in the user's workspace, not a DB)

Candidate data (name, work auth, contact, `experience[]`, `projects[]`, `skills{}`) lives in **`data/profile.json`** in the user's git-trackable workspace. This file is the single source of truth for resume content at runtime. The repo's `pipeline/master_resume_data.json` is the **engine data shape / bootstrap template only** — it is not anyone's real profile.

- **Visa kill rule:** "US Citizen/GC only", "no sponsorship", "must be US citizen", "US person", "export control" → tag `visa-kill`, stop. "Authorised to work in US", EEO boilerplate → proceed.

## Hard limits (non-negotiable, enforced by the generation harness)

| Constraint | Value |
|---|---|
| Bullet max chars | 116 |
| Tagline max chars | 76 |
| Project header max chars | 116 |
| Work entries per resume | 3 (5 bullets each) |
| Project entries per resume | 3 (3 bullets each) |
| Skills rows | 5 (QA/DevOps roles may condense to 3) |
| Total bullet paragraphs (1-page fit) | 44 |

These ceilings are generic engine mechanics. `buildv2.js` enforces them at render time via `T()` (bullet) and `TL()` (tagline), which truncate to the limit on a word boundary (`MAX_BULLET_CHARS`, `MAX_TAGLINE_CHARS`, `BULLET_WORD_BOUNDARY_MIN`, `TAGLINE_WORD_BOUNDARY_MIN` in `lib/config.ts`).

## Domain vocabulary

**role-track** — a role category (e.g. `Backend / API Engineer`, `SRE / DevOps Engineer`, `GenAI / AI Engineer`). Determines which work variant and projects are selected. The track *schema* ships with the engine; the actual per-track picks are **personal data** and live in the user's workspace, not in this repo.

**work variant** — `genai` | `systems` | `fullstack` | `sre` | `IT-track`. Selects which bullet set from a profile entry's `experience[].bullets` map. (Matches `SpineDecisionSchema.workVariant` in `lib/providers/spine.ts`.)

**visa_status** — `proceed` | `kill` | `unknown`. Set by `lib/jd-parser.ts`. Never manually overridden.

**action** — the job's pipeline stage. Valid values in `lib/actions.ts`: `0-Saved`, `1-Applied`, `2-Phone Screen`, `3-Interview`, `4-Offer`, `5-Rejected`, `6-Ghosted`. **Authoritative in the job file's `Action:` frontmatter**; the index mirrors it and preserves it across rescans (`COALESCE(excluded.action, …)`).

**clipped_at** — ISO datetime from frontmatter `created` / `date` / `clipped`. When the job was saved, not when it was scanned.

**apply_url** — application link from frontmatter `source` or set in the UI. User edits win over rescans.

**hidden** — `0` | `1`. Jobs with `hidden=1` are excluded from the default list view.

**resume profile** — the contents of `data/profile.json`. The generation pipeline reads it directly; the engine falls back to `pipeline/master_resume_data.json` only when no workspace profile exists.

**session** — an in-app working copy of the resume data used for a generation run, seeded from the profile. Can be modified interactively via Chat.

**fit_pct** — 0–100 integer score (`SpineDecision.fitPct` / `lib/fit-scorer.ts`). Not a hard gate — low scores are flagged but the resume is still generated.

**outreach_brief** — AI-generated markdown summary of networking context for a job (company research, culture signals, alumni).

**SpineDecision** — the one structured object the brain returns per JD (`lib/providers/spine.ts`): `{ fitPct, fitNote, track, workVariant, workIds[3], projects[3], tagline, skillsRows }`. Validated by Zod before rendering.

## Architectural invariants

### Single-user, no auth
There is **one user and no login**. The app binds to `127.0.0.1`; the OS account is the trust boundary. There is no `user_id` column, no per-user filtering, no session/JWT layer, and no encrypted API-key store — all removed with the cloud platform. Do not reintroduce multi-tenancy concepts into new code.

### Files are canonical; the DB is a rebuildable index
The user's `data/` workspace (`profile.json`, `jobs/*.md`, `evaluations/*.md`, `resumes/`) is the source of truth. The SQLite database at `.cache/index.db` is a **query cache** that exists only to make the UI fast over hundreds of jobs. **Writes go to files first**, then the index. Deleting `.cache/index.db` and rescanning must lose nothing.

### Provider adapter is the only brain seam
All AI calls go through `lib/providers/`. A `CliRunner` (`types.ts`) is a transport — spawn a CLI or POST to an `http` endpoint. The `ProviderAdapter` (`adapter.ts`) wraps it with the **structured-output contract**: prompt for a fenced ` ```json ` block, extract the last block (`extract-json.ts`), validate against a Zod schema, and **retry once** with the validation error on failure. The Claude runner (`claude.ts`) adds a native `--output-format json` fast-path. Never call a model SDK directly from application code; never assume Claude — every provider must satisfy the same contract.

### DB adapter pattern (over the index)
All DB access goes through `DbAdapter` (`lib/db-adapter.ts`) via `getAdapter()` — never import `getDb()` in routes. The adapter abstracts the local SQLite index. (The Neon/Postgres path belonged to the cloud build and is being removed; new code targets SQLite only.)

### Generation pipeline contract
`lib/generate-pipeline.ts` takes a `jobId`, reads the workspace profile, asks the provider adapter for a `SpineDecision`, and renders via `pipeline/buildv2.js` (`docx` npm) → `.docx`, then a Playwright HTML→PDF template → `.pdf`. Outputs land in `data/resumes/`. **No LibreOffice** — it was a ~400 MB dependency and is gone (ADR 0001 §5). `lib/providers/spine.ts` (`decideForJob` + `renderDocxBuffer`) is the self-contained tracer-bullet proof of this contract.

### Scan incremental skip rule
A job file is skipped during scan only if **both** `file_mtime` matches the stored value **and** `clipped_at` is non-null. This prevents rows with null `clipped_at` from being permanently skipped after an index migration.

### Engine vs data — the open-source split
The public repo ships the **generic engine**: validation mechanics, role-track *schema*, ATS keyword-bank *schema*, and renderers. **Personal data** — the user's profile, role-track picks, keyword banks, verb-conflict overrides — lives only in `data/`, seeded from blank templates and bootstrapped by AI onboarding. The maintainer's real harness stays in a private workspace and on `legacy/cloud-v1`; it must never be committed here.

## Key file map

| Path | Role |
|---|---|
| `lib/providers/types.ts` | `CliRunner` + `ProviderAdapter` contracts |
| `lib/providers/adapter.ts` | Universal fenced-JSON + Zod-validate + one-retry adapter |
| `lib/providers/claude.ts` | `claude -p --output-format json` runner (envelope `.result` fast-path) |
| `lib/providers/spine.ts` | `decideForJob()` + `renderDocxBuffer()` — JD → decision → DOCX |
| `lib/providers/extract-json.ts` | Extract last fenced JSON block from CLI stdout |
| `lib/jd-parser.ts` | JD markdown → `JdJob` (visa, action, clipped_at, apply_url, tags) |
| `lib/fit-scorer.ts` | JD content → role_track + fit_pct |
| `lib/generate-pipeline.ts` | Orchestrates: read profile → decide → build → validate → PDF → write |
| `lib/db-adapter.ts` | `DbAdapter` interface + `SqliteAdapter` over the index |
| `lib/db.ts` | SQLite index schema + numbered migrations |
| `lib/config.ts` | Char limits, word-boundary mins, UI timing constants |
| `pipeline/master_resume_data.json` | Engine data shape / bootstrap template (not a real profile) |
| `pipeline/buildv2.js` | DOCX generation engine (`T()`/`TL()` gates) — server-only, not writable via HTTP |
| `data/` | The user's workspace: `profile.json`, `jobs/*.md`, `evaluations/*.md`, `resumes/` |
| `.cache/index.db` | Rebuildable SQLite index over `data/` |

## Slop Register

Known AI failure patterns for this codebase: see `.claude/slop-register.md`. Read this before generating any code.

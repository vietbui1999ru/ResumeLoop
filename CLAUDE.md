# CLAUDE.md

Guidance for Claude Code (claude.ai/code) when working in this repository.

## What this repo is

ResumeLoop is a **local-first, bring-your-own-AI, single-user, open-source** job-hunt tool. Given a job description, it produces a tailored ATS-optimised 1-page DOCX resume, a fit assessment, and outreach drafts — using the user's own AI **CLI** as the brain, on the user's machine, with no API keys and no cloud.

This file is a **contributor + agent guide to the engine**. It is not anyone's personal resume harness.

> **Engine vs data — read first.** The public repo ships the *generic engine* only: validation mechanics, the role-track *schema*, the ATS keyword-bank *schema*, and the renderers. **All personal data** — a specific person's profile, role-track picks, keyword banks, verb-conflict overrides — lives in that user's `data/` workspace (`data/profile.json`), seeded from blank templates and bootstrapped by AI onboarding. Never commit personal profile content to this repo. The maintainer's full private harness is preserved at `docs/reference/CLAUDE.md` and on branch `legacy/cloud-v1`; do not inline it here.

> **Direction of record:** [ADR 0001](docs/adr/0001-pivot-to-local-first.md). Cloud v1 is frozen on `legacy/cloud-v1` (tag `v1.0-cloud-final`); see [`DEPRECATED.md`](DEPRECATED.md). Architecture: [`docs/architecture.md`](docs/architecture.md). Invariants + vocabulary: [`CONTEXT.md`](CONTEXT.md) — read before any non-trivial task.

## The three seams

1. **Brain** — `lib/providers/`. The only place the system talks to an AI. A provider adapter shells to the user's CLI (`claude -p`, `codex exec`, `gemini -p`, `opencode run`) or an `http` endpoint and enforces a structured-output contract. **Never import a model SDK in application code.**
2. **State** — the user's `data/` workspace is canonical; `.cache/index.db` is a rebuildable SQLite index over it. **Writes go to files first**, then the index.
3. **Engine** — `pipeline/buildv2.js` (`docx` npm) → ATS `.docx`, plus a Playwright HTML→PDF template → polished `.pdf`. No LibreOffice.

## Build / test / run

```bash
npm install
npm run dev            # http://localhost:3000 (binds 127.0.0.1)
npm test               # Vitest — unit + integration, once
npm test -- --watch    # watch mode
npx playwright test    # cross-browser E2E
```

Target distribution (npm CLI, in progress): `npm i -g resumeloop` → `resumeloop init ~/career` → `resumeloop` (web) / `resumeloop tui` (Ink). On first PDF render, Playwright auto-installs headless Chromium (~150 MB).

## The provider seam (`lib/providers/`)

| File | Role |
|---|---|
| `types.ts` | `CliRunner` (transport) + `ProviderAdapter` (`runStructured<T>`) contracts |
| `adapter.ts` | Universal adapter: prompt for one ` ```json ` block → extract → Zod validate → **retry once** on failure |
| `claude.ts` | `claude -p --output-format json` runner; unwraps envelope `.result` fast-path |
| `extract-json.ts` | Pull the last fenced JSON block from CLI stdout |
| `spine.ts` | `decideForJob()` → validated `SpineDecision`; `renderDocxBuffer()` → `.docx` |

Rules when touching the brain:
- Every structured call goes through `ProviderAdapter.runStructured(schema, prompt, opts)` with a Zod schema. Do not parse free text by hand.
- Treat **every provider as first-class**. Claude gets a native JSON fast-path; all others use the fenced-JSON + retry path. Do not assume Claude.
- The `CliRunner` is injected — write tests with a fake runner, no real CLI.

## Hard limits (non-negotiable, enforced by the harness)

| Constraint | Limit |
|---|---|
| Tagline | ≤76 chars |
| Bullet | ≤116 chars |
| Project header (`name \| short_stack  GitHub  date`) | ≤116 chars |
| Work entries / resume | 3 (5 bullets each) |
| Project entries / resume | 3 (3 bullets each) |
| Skills rows | 5 default; QA/DevOps may condense to 3 |
| Total bullet paragraphs (1-page fit) | 44 |

`buildv2.js` enforces bullet/tagline ceilings at render time via `T()` / `TL()` (truncate on word boundary; constants in `lib/config.ts`).

### Generic writing rules the engine assumes

- **Bullet formula:** "Built A doing B using C, producing D" — every bullet has ≥1 tool/tech + ≥1 result. Reject activity-only bullets ("Collaborated with…", "Participated in…", "Assisted with…").
- **Result-first variant** (impact / QA / DevOps roles): put the metric/outcome before the method.
- **Action-verb uniqueness:** all 24 bullets in a resume (15 work + 9 project) must start with a **unique** verb — no repeats. Track the verb list before rendering.
- **Em-dash ban:** never use `—` (U+2014) inside bullet text — ATS and reviewers flag it as an AI-writing signal. Use a semicolon, comma, or rewrite.
- **Tagline:** value-oriented, not a generic skills list. `{Title} building {what} with {tech} and {tech}`, or `{Title} — {proof point}`.
- **No** professional-summary section (tagline only). **No** "new grad" language.

> The *role-track table*, *verb-conflict overrides*, *ATS keyword banks*, and *candidate profile* are **personal data**, not engine rules. They live in the user's `data/` workspace. This repo defines only their *shape*.

## Data shapes

### `profile.json` / `master_resume_data.json` access pattern

`pipeline/master_resume_data.json` is the engine **data shape / bootstrap template**. At runtime the pipeline reads the user's `data/profile.json` (same shape). Top-level keys: `experience[]`, `projects[]`, `skills{}` (NOT `work[]`).

```javascript
const m = require('./profile.json');               // runtime: workspace profile

// Work bullets — experience[], NOT work[]; bullets is {variant: []}
const bullet = m.experience.find(x => x.id === 'someid').bullets.genai[0];
//   variant ∈ genai | systems | fullstack | sre | IT-track

// Project bullets — flat array (no variant key)
const proj = m.projects.find(x => x.id === 'someproj');
//   proj.id, proj.name, proj.url, proj.short_stack, proj.dates, proj.bullets[]

// Skills — object keyed by variant
const skills = Object.entries(m.skills.genai).map(([label, vals]) => ({ label, vals }));
```

### SpineDecision (`lib/providers/spine.ts`)

What the brain returns per JD, Zod-validated before rendering:

```ts
{ fitPct: 0–100, fitNote, track,
  workVariant: 'genai'|'systems'|'fullstack'|'sre'|'IT-track',
  workIds: [3 ids], projects: [3 ids], tagline: ≤76, skillsRows: ["Label: a · b · c", …] }
```

### Build script pattern

```javascript
const { makeDoc } = require('./buildv2.js');   // never call build() directly
const { Packer }  = require('docx');
const fs = require('fs'), path = require('path');

const RESUMES_DIR = path.join(process.cwd(), 'data', 'resumes');  // workspace output
const data = { /* name, contact, tagline, work, projects, skills */ };

Packer.toBuffer(makeDoc(data)).then(buf => {
  fs.mkdirSync(RESUMES_DIR, { recursive: true });
  fs.writeFileSync(path.join(RESUMES_DIR, data.file + '.docx'), buf);
});
```

Output filename: `VietBui_<Company>_<Role>.docx` — CamelCase, no spaces (the maintainer's convention; generic engine accepts any `data.file`).

## buildv2.js data shape

`makeDoc(data)` takes `{ name, contact, tagline, work[], projects[], skills[] }`:
- **work**: `{ id, title, company, location, dates, bullets: [T(...)] }`
- **projects**: `{ id, name, url, stack, date, bullets: [T(...)] }`
- **skills**: `{ label, vals }` objects — **never** plain strings.

`buildv2.js` is server-executed and **not writable via HTTP** (excluded from any config write allowlist).

## Common engine errors to avoid

| Error | Correct approach |
|---|---|
| `m.work.find(...)` | `m.experience.find(...)` — top-level key is `experience` |
| `m.experience.find(...).bullets` (flat) | `.bullets.genai` — bullets is a `{variant: []}` map |
| `data.skills = ['a · b']` | `data.skills = [{label, vals}]` — never plain strings |
| Passing `{name, url, stack, date, bullets}` to a project | Pass `{id, bullets}`; metadata auto-resolved from profile |
| Calling a model SDK directly | Go through `lib/providers/` `runStructured` |
| Assuming Claude / native JSON | Every provider must satisfy the fenced-JSON + retry contract |
| Adding `user_id` / auth to a route | Single-user, no auth — `127.0.0.1` is the boundary |
| DB as source of truth | Files in `data/` are canonical; the index is rebuildable |
| Em-dash `—` in bullet text | Use a semicolon or comma |
| Two bullets sharing a starting verb | Enforce unique starting verbs across all 24 bullets |
| Committing personal profile data | Personal data lives in the user's `data/` workspace, never in this repo |
| Reintroducing LibreOffice | DOCX via `docx` npm; PDF via Playwright template |

## Agent skills

- **Issue tracker** — GitHub `github.com/vietbui1999ru/ResumeLoop`. See `docs/agents/issue-tracker.md`.
- **Triage labels** — five-label vocabulary (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.
- **Domain docs** — `CONTEXT.md` at root + `docs/adr/` for architecture decisions. See `docs/agents/domain.md`.

## Feedback loop

When the maintainer flags an engine issue:
1. Optionally rate (`rate: X/3`).
2. Apply the fix, then `capture-mistake` → appends to `feedback/raw-log.md`.
3. When `feedback/raw-log.md` has ≥5 entries (or on "synthesize feedback") → `synthesize-mistakes` distils patterns into "Common engine errors to avoid" above.

Personal resume-tailoring feedback (role-track tuning, verb maps, candidate facts) belongs in the user's private workspace harness, not this engine guide.

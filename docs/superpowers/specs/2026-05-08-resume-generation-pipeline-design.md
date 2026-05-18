# Resume Generation Pipeline — Design Spec

**Date:** 2026-05-08
**Status:** Approved

---

## Overview

Add a resume generation pipeline to the ResumeLoop dashboard. Users select one or many jobs via checkboxes, click "Generate", and the system produces a tailored ATS-optimized DOCX per job using a hybrid Anthropic SDK + node subprocess pipeline. Progress streams via SSE. Mistakes are rated in the UI and fed back into future AI reasoning calls.

---

## Architecture

```
Jobs Table (checkboxes)
  → "Generate N" button
  → POST /api/generate  { jobIds: string[] }
  → per-job SSE: GET /api/generate/[jobId]/stream

Per-job staged pipeline (sequential):
  1. ai-reason    Anthropic SDK → structured JSON decision
  2. write-script render harness/batch-build/{co}_{role}.js from decision
  3. build        spawn: node harness/batch-build/{co}_{role}.js
  4. validate     spawn: node harness/validate.js {script}
  5. fix-loop     automated constraint trim (no AI call), re-build if needed
  6. finalize     mv DOCX → output folder, INSERT jd_outputs, tag JD frontmatter
```

Batch processing: each selected job gets its own SSE stream. Server processes them sequentially (one at a time) to avoid harness/batch-build directory conflicts.

---

## New Files

```
app/api/generate/route.ts                  POST { jobIds[] } → starts pipeline per job
app/api/generate/[jobId]/stream/route.ts   GET → SSE stream of stage events
app/api/generate/[jobId]/download/route.ts GET → stream DOCX file from docx_path
app/api/generate/feedback/route.ts         POST { jobId, rating, note } → appends feedback/raw-log.md

lib/generate-pipeline.ts                   orchestrates 6 stages, emits SSE events
lib/ai-reason.ts                           Anthropic SDK call → structured ReasoningResult
lib/prompt-context.ts                      assembles prompt: JD + profile + docs + feedback history
```

---

## API Surface

### POST /api/generate
```typescript
// Request
{ jobIds: string[] }

// Response
{ ok: true, queued: string[] }
```

Validates each jobId exists in DB. Returns 400 if any are unknown. Does not start the stream — the client opens individual SSE connections per job.

### GET /api/generate/[jobId]/stream
SSE endpoint. Each event is a JSON line:

```json
{ "stage": "ai-reason",  "status": "ok",   "data": { "track": "systems", "tagline": "…", "workIds": […], "projects": […] } }
{ "stage": "build",      "status": "ok",   "data": { "script": "stripe_swe.js" } }
{ "stage": "validate",   "status": "fail", "data": { "violations": ["tagline: 79 chars"] } }
{ "stage": "fix-loop",   "status": "ok",   "data": { "fixed": ["tagline trimmed to 76"] } }
{ "stage": "finalize",   "status": "ok",   "data": { "path": "/Users/…/stripe_swe_vietbui.docx" } }
{ "stage": "done",       "status": "ok",   "data": { "outputId": "abc123" } }
{ "stage": "error",      "status": "fail", "data": { "message": "…", "stage": "build" } }
```

### POST /api/generate/feedback
```typescript
// Request
{ jobId: string, outputId: string, rating: 1 | 2 | 3, note: string }

// Response
{ ok: true }
```

Appends to `feedback/raw-log.md` matching existing schema:
```
## {date} {company}_{role} rate:{N}/3
**What went wrong**: {note}
**Fix applied**: (pending — user-provided)
**Root cause**: (pending)
**Should have done**: (pending)
```
Rating-only submissions (no note) are valid — fields left as "(pending)".

---

## AI Reasoning Prompt

### System prompt context (assembled by `lib/prompt-context.ts`):
1. Full `pipeline/master_resume_data.json` (all bullet text)
2. CLAUDE.md hard constraints (tagline ≤76, bullet ≤116, para count, skills format)
3. CLAUDE.md role-track table and work-track variants
4. `docs/reference/ats-optimization-guidelines.md`
5. Last synthesized rules from `feedback/synthesized-rules.md` (falls back to last 10 entries of `feedback/raw-log.md` if no synthesis exists)

### User prompt:
```
JD content:
{raw_content}

Select and return ONLY valid JSON:
{
  "track": string,           // from role-track table
  "workVariant": string,     // "genai" | "systems" | "IT-track"
  "workIds": string[],       // exactly 3, valid IDs from master_resume_data.json
  "projects": string[],      // exactly 3, valid project IDs
  "personaTitle": string,    // ≤60 chars, NOT the JD job title verbatim
  "tagline": string,         // ≤76 chars, value-oriented formula
  "skillsRows": string[]     // exactly 5 plain strings "Tech · Tech · …"
}
```

### Accuracy levers:
- Full bullet text in system prompt — AI picks from exact strings, no hallucination
- Mistake history injected per-call — synthesized rules take priority over raw-log
- Anthropic structured outputs enforced — no markdown wrapping, no JSON parsing failures
- Character constraints stated explicitly in the prompt (not just in validate.js)
- `personaTitle` explicitly forbidden from matching JD title verbatim

---

## Fix Loop (Stage 5)

Automated only — no second AI call.

Violations handled:
- `tagline > 76 chars` → trim to last word boundary ≤76
- `bullet > 116 chars` → bullets come from master_resume_data.json (pre-validated), so this should never trigger; if it does, flag as error
- `para count > 44` → error (selection logic should prevent this)

Re-runs `node {script}.js` after each fix. Max 3 fix iterations before marking as failed.

---

## Output & DB

On finalize:
- DOCX moved from `harness/batch-build/` to the configured output folder (from `app_settings` key `output_path`)
- `jd_outputs` row inserted:
  ```sql
  INSERT INTO jd_outputs (id, job_id, docx_path, projects_used, work_ids_used, variant, tagline, built_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  ```
- JD frontmatter updated: `un-resume` → `resume-ed`

Download link served via `GET /api/generate/[jobId]/download` — streams the DOCX file from `docx_path`.

---

## Feedback & Ranking

**Capture (UI):** After finalize, each job row in the generation panel shows:
- Star rating: `[1] [2] [3]`
- Optional free-text note field
- Submit button → `POST /api/generate/feedback`

**Storage:** Appends to `feedback/raw-log.md` (existing file, existing format).

**Injection:** `lib/prompt-context.ts` reads `feedback/synthesized-rules.md` on every AI call. If file doesn't exist, falls back to last 10 raw-log entries.

**Synthesis:** Still manual via CLI `/synthesize-mistakes` — periodic, not per-generation.

---

## UI Changes

### Jobs Table
- Add checkbox column (leftmost)
- "Select all" checkbox in header
- "Generate N selected" button in header bar (disabled when 0 selected)
- New `Status` column: `—` | `⟳ {stage}` | `✓ done` | `✗ failed`

### Generation Panel
Slides in below the header when generation is active. One row per job:
```
Stripe — Software Engineer
  ✓ ai-reason   track: systems | tagline: "Software Engineer — Go, distributed systems…"
  ✓ build       stripe_swe.js
  ✗ validate    tagline: 79 chars
  ✓ fix-loop    trimmed to 76 chars
  ✓ finalize    ~/Desktop/Resumes/stripe_swe_vietbui.docx  [↓ download]
  ★ Rate: [1][2][3]  [Add note…]  [Submit]
```

### Config Page — Reference Docs Section
New section below existing editors. Read/write editors for:
- `ats-optimized-resume-system.md`
- `ats-optimization-guidelines.md`
- `CLAUDE-full.md`
- `spec-job-match-resume-generator.md`

Extend `app/api/config/read` and `app/api/config/write` ALLOWED map with `PATHS.docs.*` entries. No syntax validation needed (plain markdown).

---

## Out of Scope

- Outreach drafting (stays as a separate CLI flow)
- Parallel job processing (sequential is sufficient for personal use)
- Synthesis UI (stays as CLI `/synthesize-mistakes`)
- Cover letter generation

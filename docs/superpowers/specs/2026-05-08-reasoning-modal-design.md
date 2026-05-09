# Reasoning Modal — Design Spec

**Date:** 2026-05-08
**Status:** Approved

## Goal

After a resume is generated, expose an AI-written explanation of every selection decision — track, work experience variant, projects, tagline, and skills — directly in the jobs table UI without a separate page navigation.

## Architecture

### AI Layer (`lib/ai-reason.ts`)

Extend the existing `resume_decision` tool schema with a `reasoning` field. The AI fills both the selections and the explanation in a single tool-use call — no extra API round-trip.

```typescript
reasoning: {
  type: 'string',
  description:
    'Structured markdown with exactly 5 sections: ## Track, ## Work Experience, ## Projects, ## Tagline, ## Skills. Each section explains why this choice matches the JD. Reference specific JD keywords. 2–4 sentences or bullet points per section.'
}
```

`ReasoningResult` interface gains `reasoning: string`. `validateResult` checks it is non-empty.

### Storage Layer (`lib/db.ts`)

Add `reasoning TEXT` column to `jd_outputs` via migration (same migration pass as `pdf_path` from the PDF preview spec — one ALTER per column, idempotency-checked).

`jd_outputs` final shape after both migrations:
```
id, job_id, docx_path, pdf_path, projects_used, work_ids_used, variant, tagline, reasoning, built_at
```

### Pipeline (`lib/generate-pipeline.ts`)

Pass `decision.reasoning` to the `jd_outputs` INSERT. Log it via `GenerationLogger.setAIDecision` (already called with the full decision object — reasoning is included automatically once added to `ReasoningResult`).

### API

**`GET /api/jobs/[id]/output`** (new route) — returns the latest `jd_outputs` row for a job:
```json
{ "id": "...", "docx_path": "...", "pdf_path": "...", "tagline": "...", "reasoning": "...", "built_at": "..." }
```
Returns `404` if no output exists yet.

**`GET /api/jobs` (modified)** — add `has_reasoning` boolean via subquery:
```sql
EXISTS(SELECT 1 FROM jd_outputs WHERE job_id = j.id AND reasoning IS NOT NULL) as has_reasoning
```
Used to show the ★ button for past runs on page load without fetching individual outputs.

### Component (`components/ReasoningModal.tsx`)

- Fetches `/api/jobs/[id]/output` on open
- Splits `reasoning` on `\n## ` to extract sections
- Renders each section as a collapsible card: heading + body text
- Loading spinner during fetch; "No reasoning available — generate a resume first" empty state
- Closes on Escape or backdrop click

### UI Trigger (`app/jobs/page.tsx`)

Status column cell logic:
- **During session** (genStatus in state): `done` → show `done ★ Why?` link inline
- **On page load** (from jobs list): `has_reasoning = true` → show `★` icon in the Status cell
- Both open `ReasoningModal` with the job's ID

## Error Handling

- AI returns empty `reasoning`: pipeline logs a warning, still proceeds — modal shows empty state
- Fetch fails on modal open: show error message with retry button

## Testing

- Unit test: `validateResult` throws if `reasoning` is missing or empty
- UI: manual verify ★ button appears after generation, modal renders 5 sections with correct headings

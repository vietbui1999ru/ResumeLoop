# JD ↔ DOCX Relationship + PDF Preview — Design Spec

**Date:** 2026-05-08
**Status:** Approved

## Goal

Make the connection between a job description and its generated resume visible and navigable in the UI. Add PDF preview so the resume can be reviewed inline without downloading the DOCX.

## Context

The DB relationship already exists: `jd_outputs.job_id` references `jd_jobs.id`. What is missing is the UI surface and a PDF rendition for browser viewing. The `GET /api/jobs/[id]/download` endpoint already serves the DOCX.

## Architecture

### New DB column (`lib/db.ts`)

Add `pdf_path TEXT` to `jd_outputs` via migration (idempotency-checked, same migration pass as `reasoning`):
```sql
ALTER TABLE jd_outputs ADD COLUMN pdf_path TEXT
```

### PDF Generation (`harness/to-pdf.js`)

A standalone Node.js script — not inside Next.js — so puppeteer's Chromium does not bloat the app server startup. The pipeline calls it via `spawnAsync`.

```js
// harness/to-pdf.js
const mammoth   = require('mammoth')
const puppeteer = require('puppeteer')
const fs        = require('fs')
const path      = require('path')

const [docxPath, pdfPath] = process.argv.slice(2)

;(async () => {
  const { value: html } = await mammoth.convertToHtml({ path: docxPath })
  const browser = await puppeteer.launch({ headless: 'new' })
  const page    = await browser.newPage()
  await page.setContent(`<html><body style="font-family:sans-serif;margin:40px">${html}</body></html>`,
    { waitUntil: 'networkidle0' })
  await page.pdf({ path: pdfPath, format: 'Letter', printBackground: true, margin: { top: '0.5in', bottom: '0.5in', left: '0.5in', right: '0.5in' } })
  await browser.close()
  console.log('✓ PDF:', pdfPath)
})()
```

`harness/package.json` gains `"mammoth"` and `"puppeteer"` dependencies. The preflight step in the pipeline already runs `npm install` in `harness/batch-build/`; `to-pdf.js` lives one level up in `harness/` and needs its own `npm install` once.

### Pipeline (`lib/generate-pipeline.ts`)

After the `build` stage succeeds and the DOCX is confirmed at `docxExpected`:
1. New stage: `pdf` — yield `{ stage: 'pdf', status: 'running' }`
2. Run `node harness/to-pdf.js <docxPath> <pdfPath>` via `spawnAsync`
3. On success: `pdf_path = <pdfPath>`, yield `{ stage: 'pdf', status: 'ok', data: { pdf: pdfPath } }`
4. On failure: yield `{ stage: 'pdf', status: 'fail', data: { message } }` — **non-fatal**: pipeline continues without PDF; `pdf_path` stored as `null`

`pdf` stage added to `SSEEvent['stage']` union.

### API (`app/api/jobs/[id]/output/route.ts`)

Already planned for Reasoning Modal — returns full latest output row including `pdf_path`.

**`GET /api/jobs/[id]/preview`** (new route) — streams PDF bytes:
```typescript
const pdf = fs.readFileSync(output.pdf_path)
return new Response(pdf, {
  headers: {
    'Content-Type': 'application/pdf',
    'Content-Disposition': `inline; filename="${path.basename(output.pdf_path)}"`,
  },
})
```
Returns `404` if `pdf_path` is null or file missing.

### Jobs List (`app/api/jobs/route.ts`)

Add `has_output` boolean subquery alongside `has_reasoning`:
```sql
EXISTS(SELECT 1 FROM jd_outputs WHERE job_id = j.id) as has_output
```

### UI: JobDetailModal (`components/JobDetailModal.tsx`)

Add a **"Resume"** section between the Actions row and the raw JD body. This section is only rendered when the output API returns data.

```
┌── JobDetailModal ─────────────────────────────────┐
│ Acme Corp / Senior GenAI Engineer            [✕]  │
│ ─────────────────────────────────────────────── │
│ Track: genai   Fit: 82%   Action: 1-Applied      │
│ ─────────────────────────────────────────────── │
│ Resume                                           │
│ [↓ Download DOCX]  [👁 Preview PDF]              │
│ ┌────────────────────────────────────────────┐  │
│ │  <iframe src="/api/jobs/[id]/preview" />   │  │  ← shown when Preview clicked
│ └────────────────────────────────────────────┘  │
│ ─────────────────────────────────────────────── │
│ Open file ↗                                      │
│ ─────────────────────────────────────────────── │
│ [raw JD content scrollable]                      │
└──────────────────────────────────────────────────┘
```

The modal fetches `/api/jobs/[id]/output` on open (same call as ReasoningModal — deduplicate into a shared hook `useJobOutput(jobId)`). If no output: Resume section shows "No resume generated yet."

Preview toggle: clicking "👁 Preview PDF" reveals/hides the `<iframe>`. The iframe is lazy — `src` is only set when the user toggles it open.

### UI: Jobs Table (`app/jobs/page.tsx`)

For rows where `job.has_output = true` and no current-session `genStatus` entry: show a small `📄` icon in the Status cell. Clicking opens `JobDetailModal` (already wired — no new behavior needed, just the visual cue).

## Error Handling

- PDF generation fails: log to GenerationLogger, stage yields fail event, pipeline continues — DOCX is still delivered
- `pdf_path` stored as null — Preview button is disabled with tooltip "PDF not available"
- `/api/jobs/[id]/preview` file missing on disk: 404 with JSON error body

## Dependencies

```bash
# in harness/ (separate from main Next.js app)
npm install mammoth puppeteer
```

Puppeteer downloads Chromium (~170MB) on first install. This is a one-time cost.

## Testing

- Manual: generate a resume, open JobDetailModal, verify Download and Preview both work
- Verify PDF generation failure (e.g., bad DOCX path) does not block pipeline completion
- Verify `has_output` drives the 📄 icon on page load

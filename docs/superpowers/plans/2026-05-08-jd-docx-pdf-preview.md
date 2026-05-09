# JD-DOCX Relationship + PDF Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface the DOCX-to-job relationship in `JobDetailModal` with a Download button and an inline PDF preview. Generate PDFs in the pipeline via a standalone `harness/to-pdf.js` script (mammoth + puppeteer).

**Architecture:** Add `pdf_path TEXT` migration to `jd_outputs`; add `pdf` stage in the pipeline calling `node harness/to-pdf.js <docx> <pdf>` via `spawnAsync`; add `GET /api/jobs/[id]/preview` that streams PDF bytes; add Resume section to `JobDetailModal`; add `has_output` subquery to the jobs list so the 📄 icon shows without fetching each output.

**Tech Stack:** Node.js (mammoth + puppeteer in harness/), Next.js 14, better-sqlite3, React, Tailwind

**Prerequisite:** The `GET /api/jobs/[id]/output` route is built in the Reasoning Modal plan. This plan depends on that route existing.

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `lib/db.ts` | Modify | Add `pdf_path TEXT` migration for `jd_outputs` |
| `harness/package.json` | **Create** | mammoth + puppeteer deps for harness/ |
| `harness/to-pdf.js` | **Create** | Standalone script: DOCX → PDF via mammoth + puppeteer |
| `lib/generate-pipeline.ts` | Modify | Add `pdf` stage to SSEEvent union; call to-pdf.js after build; save `pdf_path` |
| `app/api/jobs/[id]/preview/route.ts` | **Create** | Streams PDF bytes; 404 if not available |
| `app/api/jobs/route.ts` | Modify | Add `has_output` boolean subquery |
| `components/JobDetailModal.tsx` | Modify | Resume section with Download + Preview PDF toggle |
| `lib/db.test.ts` | Modify | Test `pdf_path` column migration |

---

### Task 1: DB migration — add `pdf_path` to `jd_outputs`

**Files:**
- Modify: `lib/db.test.ts`
- Modify: `lib/db.ts`

- [ ] **Step 1: Write the failing test**

Add to `lib/db.test.ts`:
```typescript
describe('pdf_path column migration', () => {
  it('adds pdf_path to legacy jd_outputs missing it', () => {
    const db = new Database(':memory:')
    db.exec(`
      CREATE TABLE IF NOT EXISTS jd_jobs (id TEXT PRIMARY KEY, file_path TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS jd_outputs (
        id TEXT PRIMARY KEY, job_id TEXT NOT NULL, docx_path TEXT, built_at DATETIME
      );
    `)
    initSchema(db)
    const cols = db.prepare('PRAGMA table_info(jd_outputs)').all() as Array<{ name: string }>
    expect(cols.map(c => c.name)).toContain('pdf_path')
    db.close()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run lib/db.test.ts
```
Expected: FAIL — `pdf_path` not found.

- [ ] **Step 3: Add migration in `lib/db.ts`**

After the `hasReasoning` migration block (added in the Reasoning Modal plan), add:
```typescript
  const hasPdfPath = (db.prepare(`SELECT COUNT(*) as c FROM pragma_table_info('jd_outputs') WHERE name='pdf_path'`).get() as { c: number }).c > 0
  if (!hasPdfPath) db.exec(`ALTER TABLE jd_outputs ADD COLUMN pdf_path TEXT`)
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run lib/db.test.ts
```
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/db.ts lib/db.test.ts
git commit -m "feat: add pdf_path column migration to jd_outputs"
```

---

### Task 2: Install harness dependencies + create `to-pdf.js`

**Files:**
- Create: `harness/package.json`
- Create: `harness/to-pdf.js`

- [ ] **Step 1: Create `harness/package.json`**

```json
{
  "name": "resume-harness",
  "version": "1.0.0",
  "private": true,
  "dependencies": {
    "mammoth": "^1.8.0",
    "puppeteer": "^23.0.0"
  }
}
```

- [ ] **Step 2: Install harness dependencies**

```bash
cd /Users/vietquocbui/repos/ResumeAnalyze/harness && npm install
```
Expected: `node_modules/` created with mammoth and puppeteer. Puppeteer downloads Chromium (~170MB) on first install.

- [ ] **Step 3: Create `harness/to-pdf.js`**

```javascript
// Standalone script: node to-pdf.js <docxPath> <pdfPath>
const mammoth   = require('mammoth')
const puppeteer = require('puppeteer')
const fs        = require('fs')

const [, , docxPath, pdfPath] = process.argv

if (!docxPath || !pdfPath) {
  console.error('Usage: node to-pdf.js <docxPath> <pdfPath>')
  process.exit(1)
}

;(async () => {
  const { value: html } = await mammoth.convertToHtml({ path: docxPath })
  const browser = await puppeteer.launch({ headless: 'new' })
  const page    = await browser.newPage()
  await page.setContent(
    `<html><body style="font-family:sans-serif;margin:40px">${html}</body></html>`,
    { waitUntil: 'networkidle0' }
  )
  await page.pdf({
    path: pdfPath,
    format: 'Letter',
    printBackground: true,
    margin: { top: '0.5in', bottom: '0.5in', left: '0.5in', right: '0.5in' },
  })
  await browser.close()
  console.log('PDF written:', pdfPath)
})().catch(err => { console.error(err.message); process.exit(1) })
```

- [ ] **Step 4: Smoke test the script**

```bash
# Use any existing DOCX from a prior generation run
node harness/to-pdf.js /path/to/some.docx /tmp/test-resume.pdf
ls -lh /tmp/test-resume.pdf
```
Expected: `test-resume.pdf` exists, size > 10KB.

- [ ] **Step 5: Commit**

```bash
git add harness/package.json harness/to-pdf.js harness/package-lock.json
git commit -m "feat: add harness/to-pdf.js DOCX→PDF conversion script"
```

---

### Task 3: Add `pdf` stage to the pipeline

**Files:**
- Modify: `lib/generate-pipeline.ts`

- [ ] **Step 1: Add `pdf` to the `SSEEvent` stage union (~line 13)**

```typescript
export interface SSEEvent {
  stage: 'preflight' | 'ai-reason' | 'write-script' | 'build' | 'validate' | 'fix-loop' | 'finalize' | 'pdf' | 'done' | 'error'
  status: 'ok' | 'fail' | 'running'
  data: Record<string, unknown>
}
```

- [ ] **Step 2: Add PDF stage after the build loop in `runPipeline`**

After the `if (!docxPath)` guard (~line 92) and before Stage 6 (the finalize block), insert:

```typescript
  // Stage: PDF generation (non-fatal)
  yield emit({ stage: 'pdf', status: 'running', data: {} })
  let pdfPath: string | null = null
  const pdfName = docxName.replace(/\.docx$/, '.pdf')
  const pdfExpected = path.join(BATCH_BUILD, pdfName)
  const toPdfScript = path.join(process.cwd(), 'harness', 'to-pdf.js')
  try {
    const pdfResult = await spawnAsync('node', [toPdfScript, docxPath, pdfExpected], process.cwd())
    if (pdfResult.code === 0) {
      pdfPath = pdfExpected
      yield emit({ stage: 'pdf', status: 'ok', data: { pdf: pdfPath } })
    } else {
      logger.stage({ stage: 'pdf', status: 'fail', data: { message: pdfResult.stderr } })
      yield emit({ stage: 'pdf', status: 'fail', data: { message: 'PDF generation failed (non-fatal)' } })
    }
  } catch (e) {
    yield emit({ stage: 'pdf', status: 'fail', data: { message: String(e) } })
  }
```

- [ ] **Step 3: Move `pdf` to output dir and save in INSERT**

In Stage 6 (finalize block), after `fs.renameSync(docxPath, destPath)`, add:
```typescript
    let finalPdfPath: string | null = null
    if (pdfPath) {
      const pdfDest = path.join(outputDir, pdfName)
      try { fs.renameSync(pdfPath, pdfDest); finalPdfPath = pdfDest } catch { /* non-fatal */ }
    }
```

Update the `jd_outputs` INSERT to include `pdf_path` (add column + value):
```typescript
    getDb().prepare(`
      INSERT OR REPLACE INTO jd_outputs
        (id, job_id, docx_path, pdf_path, projects_used, work_ids_used, variant, tagline, reasoning, built_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).run(
      outputId, jobId, destPath, finalPdfPath,
      JSON.stringify(decision.projects),
      JSON.stringify(decision.workIds),
      decision.workVariant,
      decision.tagline,
      decision.reasoning ?? null
    )
```

- [ ] **Step 4: TypeScript check**

```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 5: Manual test — pipeline with PDF**

Trigger generation for one job. Verify in the SSE stream (via GenerationPanel) that a `pdf` stage appears. Check that `pdf_path` is non-null in the DB:
```bash
sqlite3 resume.db "SELECT docx_path, pdf_path FROM jd_outputs ORDER BY built_at DESC LIMIT 1;"
```

- [ ] **Step 6: Commit**

```bash
git add lib/generate-pipeline.ts
git commit -m "feat: add pdf stage to generation pipeline (non-fatal)"
```

---

### Task 4: `GET /api/jobs/[id]/preview` route

**Files:**
- Create: `app/api/jobs/[id]/preview/route.ts`

- [ ] **Step 1: Create the route**

```typescript
import fs from 'fs'
import path from 'path'
import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const row = getDb().prepare(
    'SELECT pdf_path FROM jd_outputs WHERE job_id = ? ORDER BY built_at DESC LIMIT 1'
  ).get(params.id) as { pdf_path: string | null } | undefined

  if (!row?.pdf_path) {
    return NextResponse.json({ error: 'PDF not available' }, { status: 404 })
  }

  if (!fs.existsSync(row.pdf_path)) {
    return NextResponse.json({ error: 'PDF file missing on disk' }, { status: 404 })
  }

  const pdf = fs.readFileSync(row.pdf_path)
  return new Response(pdf, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${path.basename(row.pdf_path)}"`,
    },
  })
}
```

- [ ] **Step 2: Smoke test**

```bash
curl -I http://localhost:3000/api/jobs/<job-id-with-pdf>/preview
```
Expected: `Content-Type: application/pdf`.

- [ ] **Step 3: Commit**

```bash
git add "app/api/jobs/[id]/preview/route.ts"
git commit -m "feat: add GET /api/jobs/[id]/preview PDF stream route"
```

---

### Task 5: Add `has_output` to jobs list

**Files:**
- Modify: `app/api/jobs/route.ts`

- [ ] **Step 1: Add `has_output` subquery to `BASE_COLS`**

Append to the `BASE_COLS` template literal (after `has_reasoning`):
```typescript
  EXISTS(SELECT 1 FROM jd_outputs WHERE job_id = j.id) as has_output
```

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add app/api/jobs/route.ts
git commit -m "feat: add has_output subquery to jobs list endpoint"
```

---

### Task 6: Resume section in `JobDetailModal`

**Files:**
- Modify: `components/JobDetailModal.tsx`

- [ ] **Step 1: Add `useJobOutput` hook**

Create `lib/useJobOutput.ts`:
```typescript
import { useState, useEffect } from 'react'

export interface JobOutput {
  id: string
  docx_path: string | null
  pdf_path: string | null
  tagline: string | null
  reasoning: string | null
  built_at: string
}

export function useJobOutput(jobId: string) {
  const [output, setOutput] = useState<JobOutput | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/jobs/${jobId}/output`)
      .then(r => r.ok ? r.json() : null)
      .then(setOutput)
      .finally(() => setLoading(false))
  }, [jobId])

  return { output, loading }
}
```

- [ ] **Step 2: Add Resume section to `JobDetailModal.tsx`**

Import the hook:
```typescript
import { useJobOutput } from '@/lib/useJobOutput'
```

Add hook call inside the component (after the job fetch effect):
```typescript
  const { output, loading: outputLoading } = useJobOutput(jobId)
  const [showPdf, setShowPdf] = useState(false)
```

Insert the Resume section after the "Actions" div (the `Open file ↗` block, ~line 103) and before the raw JD `<pre>`:
```typescript
            {/* Resume section */}
            <div className="px-5 py-3 border-b border-zinc-700">
              <p className="text-xs text-zinc-500 mb-2 uppercase tracking-wide">Resume</p>
              {outputLoading ? (
                <p className="text-xs text-zinc-500">Loading…</p>
              ) : !output ? (
                <p className="text-xs text-zinc-500">No resume generated yet.</p>
              ) : (
                <div className="space-y-2">
                  <div className="flex gap-3">
                    <a
                      href={`/api/jobs/${jobId}/download`}
                      download
                      className="text-sm text-indigo-400 hover:text-indigo-300"
                    >↓ Download DOCX</a>
                    {output.pdf_path ? (
                      <button
                        onClick={() => setShowPdf(v => !v)}
                        className="text-sm text-indigo-400 hover:text-indigo-300"
                      >
                        {showPdf ? 'Hide PDF' : '👁 Preview PDF'}
                      </button>
                    ) : (
                      <span className="text-sm text-zinc-600" title="PDF not available">👁 Preview PDF</span>
                    )}
                  </div>
                  {showPdf && (
                    <iframe
                      src={`/api/jobs/${jobId}/preview`}
                      className="w-full h-[600px] rounded border border-zinc-700"
                      title="Resume PDF preview"
                    />
                  )}
                </div>
              )}
            </div>
```

- [ ] **Step 3: TypeScript check**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Manual smoke test**

Open `JobDetailModal` for a job with a generated resume. Verify:
- Download DOCX link appears and downloads the file.
- "👁 Preview PDF" button appears when `pdf_path` is non-null.
- Clicking it reveals the iframe with the PDF.
- Clicking again hides the iframe.
- For a job with no output, "No resume generated yet." shows.

- [ ] **Step 5: Add 📄 icon to jobs table Status cell**

In `app/jobs/page.tsx`, add `has_output: number` to the `Job` interface. In the Status cell render, after the `has_reasoning` ★ check, add:
```typescript
  {j.has_output && !genStatus.has(j.id) && !j.has_reasoning && (
    <span className="text-zinc-400 text-xs" title="Resume available">📄</span>
  )}
```

- [ ] **Step 6: Commit**

```bash
git add lib/useJobOutput.ts components/JobDetailModal.tsx app/jobs/page.tsx
git commit -m "feat: add Resume section with DOCX download and PDF preview to JobDetailModal"
```

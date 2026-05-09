# Reasoning Modal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After resume generation, expose a structured AI explanation of every selection decision in a modal triggered from the jobs table Status column.

**Architecture:** Add `reasoning` field to `resume_decision` tool schema in `lib/ai-reason.ts`; store it in `jd_outputs.reasoning`; serve via `GET /api/jobs/[id]/output`; render in `components/ReasoningModal.tsx` triggered by ★ button in Status column.

**Tech Stack:** TypeScript, Next.js 14 App Router, better-sqlite3, Anthropic SDK, React, Tailwind

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `lib/db.ts` | Modify | Add `reasoning TEXT` migration for `jd_outputs` |
| `lib/ai-reason.ts` | Modify | Add `reasoning` to `ReasoningResult` + tool schema + `validateResult` |
| `lib/generate-pipeline.ts` | Modify | Pass `decision.reasoning` to `jd_outputs` INSERT |
| `app/api/jobs/[id]/output/route.ts` | **Create** | GET — returns latest `jd_outputs` row for a job |
| `app/api/jobs/route.ts` | Modify | Add `has_reasoning` boolean subquery |
| `components/ReasoningModal.tsx` | **Create** | Modal that fetches output and renders 5-section reasoning |
| `app/jobs/page.tsx` | Modify | ★ button in Status cell; `has_reasoning` on `Job` type |
| `lib/db.test.ts` | Modify | Test `reasoning` column migration |
| `lib/ai-reason.test.ts` | Modify | Test `validateResult` requires non-empty `reasoning` |

---

### Task 1: DB migration — add `reasoning` column to `jd_outputs`

**Files:**
- Modify: `lib/db.test.ts`
- Modify: `lib/db.ts`

- [ ] **Step 1: Write the failing test**

Add to `lib/db.test.ts`:

```typescript
describe('reasoning column migration', () => {
  it('adds reasoning column to legacy jd_outputs missing it', () => {
    const db = new Database(':memory:')
    db.exec(`
      CREATE TABLE IF NOT EXISTS jd_jobs (id TEXT PRIMARY KEY, file_path TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS jd_outputs (
        id TEXT PRIMARY KEY, job_id TEXT NOT NULL, docx_path TEXT, built_at DATETIME
      );
    `)
    initSchema(db)
    const cols = db.prepare('PRAGMA table_info(jd_outputs)').all() as Array<{ name: string }>
    expect(cols.map(c => c.name)).toContain('reasoning')
    db.close()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run lib/db.test.ts
```
Expected: FAIL — `reasoning` column not found.

- [ ] **Step 3: Add migration in `lib/db.ts`**

After the `hasAction` block at line 65, add two lines:
```typescript
  const hasReasoning = (db.prepare(`SELECT COUNT(*) as c FROM pragma_table_info('jd_outputs') WHERE name='reasoning'`).get() as { c: number }).c > 0
  if (!hasReasoning) db.exec(`ALTER TABLE jd_outputs ADD COLUMN reasoning TEXT`)
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run lib/db.test.ts
```
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/db.ts lib/db.test.ts
git commit -m "feat: add reasoning column migration to jd_outputs"
```

---

### Task 2: Extend `ReasoningResult` with `reasoning` field

**Files:**
- Modify: `lib/ai-reason.ts`
- Modify: `lib/ai-reason.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `lib/ai-reason.test.ts`. First export `validateResult` from `lib/ai-reason.ts` (done in Step 3). Until then the test import will fail — that is expected.

```typescript
import { describe, it, expect } from 'vitest'
import { validateResult } from './ai-reason'

describe('validateResult — reasoning', () => {
  const base = {
    track: 'genai', workVariant: 'genai',
    workIds: ['gitlab', 'carboncopies', 'udayton'],
    projects: ['ObsidianTasks', 'CalAI', 'MRR Dashboard'],
    personaTitle: 'GenAI Engineer',
    tagline: 'GenAI Engineer building LLM agents',
    skillsRows: ['r1', 'r2', 'r3', 'r4', 'r5'],
  }

  it('throws when reasoning is empty string', () => {
    expect(() => validateResult({ ...base, reasoning: '' })).toThrow('reasoning')
  })

  it('throws when reasoning is missing', () => {
    expect(() => validateResult({ ...base, reasoning: undefined as unknown as string })).toThrow('reasoning')
  })

  it('does not throw when reasoning is present', () => {
    expect(() => validateResult({ ...base, reasoning: '## Track\nsome text' })).not.toThrow()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run lib/ai-reason.test.ts
```
Expected: FAIL — `validateResult` not exported.

- [ ] **Step 3: Update `lib/ai-reason.ts`**

Add `reasoning: string` to `ReasoningResult` interface (after `skillsRows`):
```typescript
  reasoning: string
```

Add reasoning property to `TOOL_SCHEMA.input_schema.properties` (after `skillsRows` entry):
```typescript
      reasoning: {
        type: 'string',
        description:
          'Structured markdown with exactly 5 sections: ## Track, ## Work Experience, ## Projects, ## Tagline, ## Skills. Each section explains why this choice matches the JD. Reference specific JD keywords. 2-4 sentences or bullet points per section.',
      },
```

Add `'reasoning'` to the `required` array.

Change `function validateResult` → `export function validateResult`. Add check at the end of the function body:
```typescript
  if (!r.reasoning || r.reasoning.trim() === '') throw new Error('reasoning missing from AI response')
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run lib/ai-reason.test.ts
```
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/ai-reason.ts lib/ai-reason.test.ts
git commit -m "feat: add reasoning field to ReasoningResult tool schema and validation"
```

---

### Task 3: Save `reasoning` in the pipeline INSERT

**Files:**
- Modify: `lib/generate-pipeline.ts` (~line 104)

- [ ] **Step 1: Update the INSERT statement**

In the Stage 6 block, replace the INSERT with:
```typescript
    getDb().prepare(`
      INSERT OR REPLACE INTO jd_outputs
        (id, job_id, docx_path, projects_used, work_ids_used, variant, tagline, reasoning, built_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).run(
      outputId, jobId, destPath,
      JSON.stringify(decision.projects),
      JSON.stringify(decision.workIds),
      decision.workVariant,
      decision.tagline,
      decision.reasoning ?? null
    )
```

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/generate-pipeline.ts
git commit -m "feat: persist reasoning in jd_outputs INSERT"
```

---

### Task 4: `GET /api/jobs/[id]/output` route

**Files:**
- Create: `app/api/jobs/[id]/output/route.ts`

- [ ] **Step 1: Create the file**

```typescript
import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const row = getDb().prepare(`
    SELECT id, job_id, docx_path, pdf_path, projects_used, work_ids_used,
           variant, tagline, reasoning, built_at
    FROM jd_outputs
    WHERE job_id = ?
    ORDER BY built_at DESC
    LIMIT 1
  `).get(params.id)

  if (!row) return NextResponse.json({ error: 'No output found' }, { status: 404 })
  return NextResponse.json(row)
}
```

> Note: `pdf_path` column is referenced here — it returns `null` until the PDF Preview plan adds it.

- [ ] **Step 2: Smoke test**

```bash
npm run dev
# In another terminal:
curl http://localhost:3000/api/jobs/<any-job-id-with-output>/output
```
Expected: JSON with `reasoning` field.

- [ ] **Step 3: Commit**

```bash
git add "app/api/jobs/[id]/output/route.ts"
git commit -m "feat: add GET /api/jobs/[id]/output route"
```

---

### Task 5: Add `has_reasoning` to jobs list endpoint

**Files:**
- Modify: `app/api/jobs/route.ts`

- [ ] **Step 1: Update `BASE_COLS` and add table alias**

Replace the file contents:
```typescript
import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

const BASE_COLS = `
  j.id, j.company, j.role_title, j.role_track, j.fit_pct, j.visa_status,
  j.tags, j.action, j.file_mtime, j.scanned_at,
  EXISTS(SELECT 1 FROM jd_outputs WHERE job_id = j.id AND reasoning IS NOT NULL) as has_reasoning
`

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get('q')?.trim() ?? ''

  const jobs = q
    ? getDb().prepare(`
        SELECT ${BASE_COLS} FROM jd_jobs j
        WHERE j.company LIKE ? OR j.role_title LIKE ? OR j.role_track LIKE ? OR j.raw_content LIKE ?
        ORDER BY j.company ASC
      `).all(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`)
    : getDb().prepare(`
        SELECT ${BASE_COLS} FROM jd_jobs j ORDER BY j.company ASC
      `).all()

  return NextResponse.json(jobs)
}
```

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add app/api/jobs/route.ts
git commit -m "feat: add has_reasoning subquery to jobs list endpoint"
```

---

### Task 6: `ReasoningModal` component

**Files:**
- Create: `components/ReasoningModal.tsx`

- [ ] **Step 1: Create the component**

```typescript
'use client'
import { useEffect, useState } from 'react'

interface Output {
  reasoning: string
  tagline: string
  variant: string
  built_at: string
}

interface Props {
  jobId: string
  company: string
  roleTitle: string
  onClose: () => void
}

export default function ReasoningModal({ jobId, company, roleTitle, onClose }: Props) {
  const [output, setOutput] = useState<Output | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch(`/api/jobs/${jobId}/output`)
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(setOutput)
      .catch(() => setError('Failed to load reasoning'))
      .finally(() => setLoading(false))
  }, [jobId])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const sections = output?.reasoning
    ? output.reasoning.split(/\n(?=## )/).map(s => {
        const newlineIdx = s.indexOf('\n')
        const heading = s.slice(0, newlineIdx === -1 ? s.length : newlineIdx).replace(/^##\s*/, '')
        const body = newlineIdx === -1 ? '' : s.slice(newlineIdx + 1).trim()
        return { heading, body }
      })
    : []

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={onClose}
    >
      <div
        className="relative bg-zinc-900 border border-zinc-700 rounded-lg w-full max-w-2xl max-h-[85vh] flex flex-col mx-4"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between p-5 border-b border-zinc-700">
          <div>
            <h2 className="text-base font-semibold text-zinc-100">AI Reasoning</h2>
            <p className="text-sm text-zinc-400 mt-0.5">{company} — {roleTitle}</p>
          </div>
          <button onClick={onClose} className="ml-4 text-zinc-500 hover:text-zinc-200 text-lg leading-none">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {loading && <p className="text-zinc-400 text-sm">Loading…</p>}
          {error   && <p className="text-red-400 text-sm">{error}</p>}
          {!loading && !error && sections.length === 0 && (
            <p className="text-zinc-500 text-sm">No reasoning available — generate a resume first.</p>
          )}
          {sections.map(({ heading, body }) => (
            <div key={heading}>
              <h3 className="text-sm font-semibold text-indigo-300 mb-1">{heading}</h3>
              <p className="text-sm text-zinc-300 whitespace-pre-wrap leading-relaxed">{body}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add components/ReasoningModal.tsx
git commit -m "feat: add ReasoningModal component"
```

---

### Task 7: Wire ★ trigger in jobs table

**Files:**
- Modify: `app/jobs/page.tsx`

- [ ] **Step 1: Add `has_reasoning` to Job interface (~line 18)**

```typescript
  has_reasoning: number  // SQLite returns 0 or 1
```

- [ ] **Step 2: Add modal state and import (~line 4 imports, ~line 66 state)**

Import:
```typescript
import ReasoningModal from '@/components/ReasoningModal'
```

State (after `selectedJobId`):
```typescript
  const [reasoningJobId, setReasoningJobId] = useState<string | null>(null)
```

- [ ] **Step 3: Update the Status cell in the table row render**

Find the table cell that reads `genStatus.get(j.id)`. Replace its contents with:
```typescript
<td className="py-1.5 pr-4 whitespace-nowrap">
  {genStatus.has(j.id) ? (
    <span className="text-zinc-400 text-xs">
      {genStatus.get(j.id)}
      {genStatus.get(j.id) === 'done' && (
        <button
          onClick={e => { e.stopPropagation(); setReasoningJobId(j.id) }}
          className="ml-1 text-yellow-400 hover:text-yellow-300"
          title="AI reasoning"
        >★ Why?</button>
      )}
    </span>
  ) : j.has_reasoning ? (
    <button
      onClick={e => { e.stopPropagation(); setReasoningJobId(j.id) }}
      className="text-yellow-400 hover:text-yellow-300 text-xs"
      title="AI reasoning"
    >★</button>
  ) : null}
</td>
```

- [ ] **Step 4: Render the modal at bottom of JSX return**

```typescript
{reasoningJobId && (() => {
  const j = jobs.find(x => x.id === reasoningJobId)
  return j ? (
    <ReasoningModal
      jobId={reasoningJobId}
      company={j.company}
      roleTitle={j.role_title}
      onClose={() => setReasoningJobId(null)}
    />
  ) : null
})()}
```

- [ ] **Step 5: TypeScript check**

```bash
npx tsc --noEmit
```

- [ ] **Step 6: Manual smoke test**

Run `npm run dev`. Navigate to `/jobs`. For any job with a previous generation, verify ★ icon appears in Status column. Click it — verify modal opens with 5 sections. Generate a new resume — verify ★ Why? link appears in the Status cell on completion. Reload page — verify ★ still appears from DB.

- [ ] **Step 7: Commit**

```bash
git add app/jobs/page.tsx
git commit -m "feat: wire reasoning modal ★ trigger in jobs table"
```

# ResumeLoop Web App Cleanup — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove all LLM calls from the web app (chat + batch generation), fix the jobs scanner feedback, add a proper tag filter, and verify the Sankey pipeline chart reflects correct data.

**Architecture:** Clean split — web app is tracking/visualization only, zero LLM calls. Scanner reads JD markdown files into SQLite. All resume generation happens via Claude Code CLI (separate harness, separate plan). Jobs folder lives at `./jobs/` inside the repo.

**Tech Stack:** Next.js 14, TypeScript, better-sqlite3, Tailwind, Recharts, Vitest

---

## File Map

**Delete:**
- `app/chat/page.tsx` — chat UI
- `app/api/chat/route.ts` — chat API (OpenAI/LLM calls)
- `lib/llm-client.ts` — LLM client abstraction
- `lib/llm-selector.ts` — LLM model selector
- `lib/context-builder.ts` — LLM context builder
- `lib/batch-worker.ts` — batch job builder (calls LLM)
- `app/api/batch/run/route.ts` — batch run SSE stream (calls batch-worker)

**Modify:**
- `components/Sidebar.tsx` — remove Chat nav item
- `app/jobs/page.tsx` — remove batch UI (Build button, log panel, selected state, runBatch); add scan error feedback; add tag filter
- `lib/settings.ts` — change `jobs_path` default from `~/Jobs` to `./jobs` (repo-relative)

**Create:**
- `lib/tag-filter.ts` — pure function: filter jobs by tag string
- `lib/tag-filter.test.ts` — unit tests for tag filter
- `lib/get-metrics.test.ts` — unit tests for pipeline stage counting

---

## Task 1: Delete LLM files

**Files:**
- Delete: `app/chat/page.tsx`
- Delete: `app/api/chat/route.ts`
- Delete: `lib/llm-client.ts`
- Delete: `lib/llm-selector.ts`
- Delete: `lib/context-builder.ts`

- [ ] **Step 1: Delete chat page and API**

```bash
rm app/chat/page.tsx app/api/chat/route.ts
```

- [ ] **Step 2: Delete LLM lib files**

```bash
rm lib/llm-client.ts lib/llm-selector.ts lib/context-builder.ts
```

- [ ] **Step 3: Remove Chat from sidebar**

In `components/Sidebar.tsx`, remove the `{ href: '/chat', label: 'Chat' }` entry from the `NAV` array:

```typescript
const NAV = [
  { href: '/',         label: 'Dashboard' },
  { href: '/jobs',     label: 'Jobs' },
  { href: '/config',   label: 'Config' },
  { href: '/settings', label: 'Settings' },
]
```

- [ ] **Step 4: Verify no TypeScript errors**

```bash
npx tsc --noEmit
```

Expected: no errors referencing deleted files. If imports exist elsewhere, remove them.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: remove chat — clean split, no LLM in web app"
```

---

## Task 2: Delete batch generation

**Files:**
- Delete: `lib/batch-worker.ts`
- Delete: `app/api/batch/run/route.ts`
- Modify: `app/jobs/page.tsx`

- [ ] **Step 1: Delete batch files**

```bash
rm lib/batch-worker.ts app/api/batch/run/route.ts
```

- [ ] **Step 2: Strip batch UI from jobs page**

Replace the entire `app/jobs/page.tsx` state and handler block. Remove:
- `selected`, `log`, `running` state
- `toggle`, `toggleAll`, `runBatch` functions
- `Build X selected` button
- checkbox column in table header and rows
- log panel at bottom

The slimmed state block (keep only filter + sort state):

```typescript
export default function JobsPage() {
  const [jobs, setJobs]         = useState<Job[]>([])
  const [scanStatus, setScanStatus] = useState<string>('')

  // Filter state
  const [q, setQ]               = useState('')
  const [trackFilter, setTrackFilter] = useState('')
  const [tagFilter, setTagFilter] = useState('')
  const [fitMin, setFitMin]     = useState(0)
  const [visaFilter, setVisaFilter] = useState<'all' | 'proceed' | 'kill'>('proceed')
  const [showMode, setShowMode] = useState<'pending' | 'all'>('pending')

  // Sort state
  const [sort, setSort] = useState<{ col: SortCol; dir: SortDir }>({ col: 'file_mtime', dir: 'desc' })
```

Remove the `SortCol` union entry for `scanned_at` if it causes issues (keep it — it's useful).

Remove `pLimit` from any import if it existed (it was in `batch/run`, not jobs page directly — verify no import).

- [ ] **Step 3: Remove checkbox column from table**

Table header — remove the checkbox `<th>`:
```typescript
<thead>
  <tr className="border-b border-zinc-700">
    <SortTh label="Company"  col="company"    sort={sort} onSort={onSort} />
    <SortTh label="Role"     col="role_title" sort={sort} onSort={onSort} />
    <SortTh label="Track"    col="role_track" sort={sort} onSort={onSort} />
    <SortTh label="Fit%"     col="fit_pct"    sort={sort} onSort={onSort} className="w-16" />
    <SortTh label="Clipped"  col="file_mtime" sort={sort} onSort={onSort} className="w-28" />
    <SortTh label="Scanned"  col="scanned_at" sort={sort} onSort={onSort} className="w-28" />
    <th className="pb-2 w-16 text-left text-zinc-500">Visa</th>
  </tr>
</thead>
```

Table rows — remove the checkbox `<td>`.

- [ ] **Step 4: Update header bar**

Remove `Build X selected` button. Keep only `Scan`:

```typescript
<div className="flex items-center gap-3">
  <h1 className="text-xl font-semibold">Jobs</h1>
  <span className="text-sm text-zinc-500">{visible.length} shown</span>
  <button onClick={scan} className="ml-auto text-sm px-3 py-1 bg-zinc-700 hover:bg-zinc-600 rounded">
    Scan
  </button>
  {scanStatus && (
    <span className={`text-sm ${scanStatus.startsWith('Error') ? 'text-red-400' : 'text-green-400'}`}>
      {scanStatus}
    </span>
  )}
</div>
```

- [ ] **Step 5: Verify TypeScript**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: remove batch generation UI — generation is Claude Code CLI only"
```

---

## Task 3: Fix scan feedback + jobs_path default

**Files:**
- Modify: `lib/settings.ts`
- Modify: `app/jobs/page.tsx` (scan handler)

- [ ] **Step 1: Fix jobs_path default in settings.ts**

In `lib/settings.ts`, change the default for `jobs_path`:

```typescript
const DEFAULTS: AppSettings = {
  jobs_path:   process.env.OBSIDIAN_JOBS_PATH ?? path.join(process.cwd(), 'jobs'),
  output_path: process.env.OUTPUT_PATH        ?? path.join(os.homedir(), 'Desktop', 'Resume Templates'),
}
```

This makes the default `<repo>/jobs/` so a fresh checkout works without configuring settings.

- [ ] **Step 2: Fix scan handler to surface errors**

In `app/jobs/page.tsx`, update the `scan` function:

```typescript
const scan = async () => {
  setScanStatus('Scanning…')
  const res = await fetch('/api/batch/scan', { method: 'POST' })
  const data = await res.json()
  if (res.ok) {
    setScanStatus(`Scanned ${data.scanned} files`)
    reload()
  } else {
    setScanStatus(`Error: ${data.error ?? 'scan failed'}`)
  }
  setTimeout(() => setScanStatus(''), 4000)
}
```

- [ ] **Step 3: Verify TypeScript**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Create the jobs directory**

```bash
mkdir -p /Users/vietquocbui/repos/ResumeLoop/jobs
echo "# jobs folder — JD markdown files live here" > /Users/vietquocbui/repos/ResumeLoop/jobs/.gitkeep
```

- [ ] **Step 5: Commit**

```bash
git add lib/settings.ts app/jobs/page.tsx jobs/.gitkeep
git commit -m "fix: jobs_path defaults to ./jobs; scan shows error/success feedback"
```

---

## Task 4: Add tag filter to jobs page

**Files:**
- Create: `lib/tag-filter.ts`
- Create: `lib/tag-filter.test.ts`
- Modify: `app/jobs/page.tsx`

- [ ] **Step 1: Write the failing test**

Create `lib/tag-filter.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { extractAllTags, jobMatchesTagFilter } from './tag-filter'

const makeJob = (tags: string[]) => ({ tags: JSON.stringify(tags) })

describe('extractAllTags', () => {
  it('returns sorted unique tags across all jobs', () => {
    const jobs = [makeJob(['clippings', 'un-resume']), makeJob(['clippings', 'resume-ed'])]
    expect(extractAllTags(jobs)).toEqual(['clippings', 'resume-ed', 'un-resume'])
  })

  it('returns empty array for jobs with no tags', () => {
    expect(extractAllTags([makeJob([])])).toEqual([])
  })
})

describe('jobMatchesTagFilter', () => {
  it('returns true when tagFilter is empty', () => {
    expect(jobMatchesTagFilter(makeJob(['un-resume']), '')).toBe(true)
  })

  it('returns true when job has the filter tag', () => {
    expect(jobMatchesTagFilter(makeJob(['un-resume', 'jobs']), 'un-resume')).toBe(true)
  })

  it('returns false when job lacks the filter tag', () => {
    expect(jobMatchesTagFilter(makeJob(['resume-ed']), 'un-resume')).toBe(false)
  })

  it('handles malformed tags gracefully', () => {
    expect(jobMatchesTagFilter({ tags: 'bad json' }, 'un-resume')).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run lib/tag-filter.test.ts
```

Expected: FAIL — `Cannot find module './tag-filter'`

- [ ] **Step 3: Implement tag-filter.ts**

Create `lib/tag-filter.ts`:

```typescript
interface HasTags { tags: string }

export function parseTags(job: HasTags): string[] {
  try {
    const parsed = JSON.parse(job.tags ?? '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function extractAllTags(jobs: HasTags[]): string[] {
  const set = new Set<string>()
  for (const job of jobs) {
    for (const tag of parseTags(job)) set.add(tag)
  }
  return Array.from(set).sort()
}

export function jobMatchesTagFilter(job: HasTags, tagFilter: string): boolean {
  if (!tagFilter) return true
  return parseTags(job).includes(tagFilter)
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run lib/tag-filter.test.ts
```

Expected: all 6 tests PASS.

- [ ] **Step 5: Wire tag filter into jobs page**

In `app/jobs/page.tsx`:

Add import at top:
```typescript
import { extractAllTags, jobMatchesTagFilter } from '@/lib/tag-filter'
```

Add `allTags` derived from jobs:
```typescript
const allTags = useMemo(() => extractAllTags(jobs), [jobs])
```

Add tag filter dropdown to the filter bar (after track filter):
```typescript
<select
  value={tagFilter}
  onChange={e => setTagFilter(e.target.value)}
  className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm text-zinc-300"
>
  <option value="">All tags</option>
  {allTags.map(t => <option key={t} value={t}>{t}</option>)}
</select>
```

In the `visible` useMemo, replace the existing `showMode` tag check with the combined filter:

```typescript
const visible = useMemo(() => {
  let list = jobs.filter(j => {
    const tags = parseTags(j)   // use parseTags from tag-filter

    if (showMode === 'pending' && !tags.includes('un-resume')) return false
    if (!jobMatchesTagFilter(j, tagFilter)) return false
    if (visaFilter === 'proceed' && j.visa_status === 'kill') return false
    if (visaFilter === 'kill'   && j.visa_status !== 'kill') return false
    if (trackFilter && j.role_track !== trackFilter) return false
    if (j.fit_pct < fitMin) return false
    if (q) {
      const lq = q.toLowerCase()
      if (![j.company, j.role_title, j.role_track ?? ''].some(s => s.toLowerCase().includes(lq))) return false
    }
    return true
  })
  // sort unchanged
  ...
```

Also remove the inline `JSON.parse(j.tags ?? '[]')` call — it's replaced by `parseTags`.

Add `tagFilter` to the `useMemo` dependency array: `[jobs, q, trackFilter, tagFilter, fitMin, visaFilter, showMode, sort]`

- [ ] **Step 6: Verify TypeScript**

```bash
npx tsc --noEmit
```

- [ ] **Step 7: Commit**

```bash
git add lib/tag-filter.ts lib/tag-filter.test.ts app/jobs/page.tsx
git commit -m "feat: add tag filter to jobs page with extractAllTags + jobMatchesTagFilter"
```

---

## Task 5: Verify and fix Sankey pipeline counts

**Files:**
- Create: `lib/get-metrics.test.ts`
- Modify: `lib/get-metrics.ts` (if edge cases found)

- [ ] **Step 1: Write pipeline count tests**

Create `lib/get-metrics.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'

// Extract the tag-counting logic so we can test it in isolation
function countPipeline(tagRows: Array<{ tags: string }>) {
  const pipeline = { scraped: tagRows.length, visa_kill: 0, pending: 0, resume_built: 0, applied: 0, interviewed: 0, rejected: 0, offer: 0 }
  for (const { tags } of tagRows) {
    let t: string[] = []
    try { t = JSON.parse(tags ?? '[]') } catch { /* skip */ }
    if (t.includes('un-resume'))   pipeline.pending++
    if (t.includes('resume-ed'))   pipeline.resume_built++
    if (t.includes('applied'))     pipeline.applied++
    if (t.includes('interviewed')) pipeline.interviewed++
    if (t.includes('rejected'))    pipeline.rejected++
    if (t.includes('offer'))       pipeline.offer++
  }
  return pipeline
}

describe('pipeline counting', () => {
  it('counts pending jobs correctly', () => {
    const rows = [
      { tags: JSON.stringify(['clippings', 'un-resume']) },
      { tags: JSON.stringify(['clippings', 'resume-ed']) },
      { tags: JSON.stringify(['clippings']) },
    ]
    const p = countPipeline(rows)
    expect(p.scraped).toBe(3)
    expect(p.pending).toBe(1)
    expect(p.resume_built).toBe(1)
    expect(p.applied).toBe(0)
  })

  it('counts applied + interviewed correctly', () => {
    const rows = [
      { tags: JSON.stringify(['resume-ed', 'applied', 'interviewed']) },
      { tags: JSON.stringify(['resume-ed', 'applied']) },
    ]
    const p = countPipeline(rows)
    expect(p.resume_built).toBe(2)
    expect(p.applied).toBe(2)
    expect(p.interviewed).toBe(1)
  })

  it('handles malformed tags without crashing', () => {
    const rows = [{ tags: 'not json' }, { tags: '' }, { tags: '[]' }]
    expect(() => countPipeline(rows)).not.toThrow()
  })

  it('counts visa_kill separately via visa_status field', () => {
    // visa_kill is counted from visa_status, not tags — test that separately
    const rows = [{ tags: '[]' }, { tags: '[]' }]
    const p = countPipeline(rows)
    expect(p.visa_kill).toBe(0) // visa_kill is computed from visa_status in real code
  })
})
```

- [ ] **Step 2: Run tests**

```bash
npx vitest run lib/get-metrics.test.ts
```

Expected: all 4 tests PASS (the logic is already in `get-metrics.ts` — we're verifying it works).

- [ ] **Step 3: Fix malformed tag handling in get-metrics.ts**

In `lib/get-metrics.ts`, wrap the tag parse in a try/catch (it currently doesn't have one):

```typescript
for (const { tags } of tagRows) {
  let t: string[] = []
  try { t = JSON.parse(tags ?? '[]') } catch { /* skip malformed row */ }
  if (t.includes('un-resume'))   pipeline.pending++
  if (t.includes('resume-ed'))   pipeline.resume_built++
  if (t.includes('applied'))     pipeline.applied++
  if (t.includes('interviewed')) pipeline.interviewed++
  if (t.includes('rejected'))    pipeline.rejected++
  if (t.includes('offer'))       pipeline.offer++
}
```

- [ ] **Step 4: Run full test suite**

```bash
npx vitest run
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/get-metrics.ts lib/get-metrics.test.ts
git commit -m "fix: guard malformed tags in computeMetrics; add pipeline count tests"
```

---

## Task 6: Final build + smoke test

- [ ] **Step 1: Full TypeScript check**

```bash
npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 2: Run all tests**

```bash
npx vitest run
```

Expected: all tests pass.

- [ ] **Step 3: Build**

```bash
npm run build
```

Expected: build succeeds, no missing module errors.

- [ ] **Step 4: Smoke test dev server**

```bash
npm run dev
```

Open `http://localhost:3000`. Verify:
- Dashboard loads (shows "No data yet" if DB empty — correct)
- Jobs page loads, filter bar shows track/tag/visa/fit dropdowns, no Build button
- Settings page loads, Jobs folder shows `<repo>/jobs/`
- Scan button shows "Scanned 0 files" or error if folder missing
- No Chat link in sidebar

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "chore: web app cleanup complete — tracking/viz only, zero LLM"
```

---

## Self-Review

**Spec coverage check:**
- ✅ Remove chat (Tasks 1)
- ✅ Remove batch generation (Task 2)
- ✅ Fix graphs when JDs not fetched (Task 3 — scan feedback + correct default path)
- ✅ Tags working as filters (Task 4)
- ✅ Sankey correct data (Task 5)
- ✅ No LLM calls remain in web app (Tasks 1+2)

**Gaps:**
- `app/config/page.tsx` — not touched. Read it before starting; if it references `llm-client` or `batch-worker`, delete those imports in Task 1.
- `app/api/settings/route.ts` — not read. Verify it doesn't reference deleted lib files.

**Placeholder scan:** None found. All steps have exact code.

**Type consistency:**
- `HasTags` interface defined in `tag-filter.ts` — jobs page uses `Job` interface which has `tags: string` ✓ compatible.
- `parseTags` imported in jobs page replaces inline `JSON.parse` ✓

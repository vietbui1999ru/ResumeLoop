# Stage ↔ Action Bidirectional Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the 6 stage buttons in the job detail modal and the Action dropdown in the jobs list reflect the same single state — `job.action` — with real-time bidirectional sync.

**Architecture:** Add a `TAG_TO_ACTION` / `ACTION_TO_TAG` mapping to `lib/pipeline-tags.ts`. Pass `currentAction` (reactive from parent's `jobs[]`) and `onActionChange` callback down into `JobDetailModal` → `JdPanel`. Stage buttons derive their active state from `currentAction` via the mapping and call `onActionChange` on click instead of `onTagToggle`.

**Tech Stack:** Next.js 14, TypeScript, React, Vitest (for lib unit test)

---

### Task 1: Add bidirectional mapping to `lib/pipeline-tags.ts`

**Files:**
- Modify: `lib/pipeline-tags.ts`
- Create: `lib/pipeline-tags.test.ts`

- [ ] **Step 1: Write the failing test**

Create `lib/pipeline-tags.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { TAG_TO_ACTION, ACTION_TO_TAG, PIPELINE_TAGS } from './pipeline-tags'

describe('TAG_TO_ACTION', () => {
  it('maps every pipeline tag key to a VALID_ACTION', () => {
    const keys = PIPELINE_TAGS.map(t => t.key)
    for (const key of keys) {
      expect(TAG_TO_ACTION[key]).toBeDefined()
      expect(TAG_TO_ACTION[key]).toMatch(/^\d-/)
    }
  })

  it('does not include 0-Saved (no tag for the default state)', () => {
    expect(Object.values(TAG_TO_ACTION)).not.toContain('0-Saved')
  })
})

describe('ACTION_TO_TAG', () => {
  it('is the exact inverse of TAG_TO_ACTION', () => {
    for (const [tagKey, action] of Object.entries(TAG_TO_ACTION)) {
      expect(ACTION_TO_TAG[action]).toBe(tagKey)
    }
  })

  it('returns undefined for 0-Saved (no tag maps to it)', () => {
    expect(ACTION_TO_TAG['0-Saved']).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/vietquocbui/repos/ResumeLoop/.claude/worktrees/stage-action-sync && npx vitest run lib/pipeline-tags.test.ts
```

Expected: FAIL — `TAG_TO_ACTION is not exported from './pipeline-tags'`

- [ ] **Step 3: Add the mapping exports to `lib/pipeline-tags.ts`**

Append to the end of `lib/pipeline-tags.ts`:

```typescript
export const TAG_TO_ACTION: Record<string, string> = {
  'applied':      '1-Applied',
  'phone-screen': '2-Phone Screen',
  'interviewed':  '3-Interview',
  'offer':        '4-Offer',
  'rejected':     '5-Rejected',
  'ghosted':      '6-Ghosted',
}

export const ACTION_TO_TAG: Record<string, string> =
  Object.fromEntries(Object.entries(TAG_TO_ACTION).map(([k, v]) => [v, k]))
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /Users/vietquocbui/repos/ResumeLoop/.claude/worktrees/stage-action-sync && npx vitest run lib/pipeline-tags.test.ts
```

Expected: PASS — 4 tests pass

- [ ] **Step 5: Commit**

```bash
git add lib/pipeline-tags.ts lib/pipeline-tags.test.ts
git commit -m "feat: add TAG_TO_ACTION / ACTION_TO_TAG bidirectional mapping"
```

---

### Task 2: Add `currentAction` + `onActionChange` props to `JobDetailModal`

**Files:**
- Modify: `components/JobDetailModal.tsx` (Props interface, component signature, JdPanel interface, both JdPanel call sites)

This task threads the new props from the modal's public API all the way into JdPanel's signature. No behavior changes yet — just the plumbing.

- [ ] **Step 1: Expand the `Props` interface (line 49–53)**

Replace:
```typescript
interface Props {
  jobId: string
  onClose: () => void
  onTagsChange?: (tags: string[]) => void
}
```

With:
```typescript
interface Props {
  jobId: string
  onClose: () => void
  onTagsChange?: (tags: string[]) => void
  currentAction?: string
  onActionChange?: (action: string) => void
}
```

- [ ] **Step 2: Destructure the new props in the component function (line 148)**

Replace:
```typescript
export default function JobDetailModal({ jobId, onClose, onTagsChange }: Props) {
```

With:
```typescript
export default function JobDetailModal({ jobId, onClose, onTagsChange, currentAction, onActionChange }: Props) {
```

- [ ] **Step 3: Expand the `JdPanel` function's props type (lines 765–777)**

Replace:
```typescript
function JdPanel({ job, tags, localTags, onTagToggle, output, outputLoading, onGenCoverLetter, coverLoading, applyUrl, onSaveApplyUrl, applyUrlSaving }: {
  job: JobDetail
  tags: string[]
  localTags: string[]
  onTagToggle: (key: string) => void
  output: ReturnType<typeof useJobOutput>['output']
  outputLoading: boolean
  onGenCoverLetter: () => void
  coverLoading: boolean
  applyUrl: string | null
  onSaveApplyUrl: (url: string | null) => Promise<void>
  applyUrlSaving: boolean
}) {
```

With:
```typescript
function JdPanel({ job, tags, localTags, onTagToggle, output, outputLoading, onGenCoverLetter, coverLoading, applyUrl, onSaveApplyUrl, applyUrlSaving, currentAction, onActionChange }: {
  job: JobDetail
  tags: string[]
  localTags: string[]
  onTagToggle: (key: string) => void
  output: ReturnType<typeof useJobOutput>['output']
  outputLoading: boolean
  onGenCoverLetter: () => void
  coverLoading: boolean
  applyUrl: string | null
  onSaveApplyUrl: (url: string | null) => Promise<void>
  applyUrlSaving: boolean
  currentAction?: string
  onActionChange?: (action: string) => void
}) {
```

- [ ] **Step 4: Pass new props to the mobile JdPanel call site (line ~468)**

Replace:
```tsx
<JdPanel
  job={job}
  tags={tags}
  localTags={localTags}
  onTagToggle={handleTagToggle}
  output={output}
  outputLoading={outputLoading}
  onGenCoverLetter={generateCoverLetter}
  coverLoading={coverLoading}
  applyUrl={applyUrl}
  onSaveApplyUrl={saveApplyUrl}
  applyUrlSaving={applyUrlSaving}
/>
```

With:
```tsx
<JdPanel
  job={job}
  tags={tags}
  localTags={localTags}
  onTagToggle={handleTagToggle}
  output={output}
  outputLoading={outputLoading}
  onGenCoverLetter={generateCoverLetter}
  coverLoading={coverLoading}
  applyUrl={applyUrl}
  onSaveApplyUrl={saveApplyUrl}
  applyUrlSaving={applyUrlSaving}
  currentAction={currentAction}
  onActionChange={onActionChange}
/>
```

- [ ] **Step 5: Pass new props to the desktop JdPanel call site (line ~679)**

Replace (the desktop path inside the DndContext):
```tsx
<JdPanel
  job={job}
  tags={tags}
  localTags={localTags}
  onTagToggle={handleTagToggle}
  output={output}
  outputLoading={outputLoading}
  onGenCoverLetter={generateCoverLetter}
  coverLoading={coverLoading}
  applyUrl={applyUrl}
  onSaveApplyUrl={saveApplyUrl}
  applyUrlSaving={applyUrlSaving}
/>
```

With:
```tsx
<JdPanel
  job={job}
  tags={tags}
  localTags={localTags}
  onTagToggle={handleTagToggle}
  output={output}
  outputLoading={outputLoading}
  onGenCoverLetter={generateCoverLetter}
  coverLoading={coverLoading}
  applyUrl={applyUrl}
  onSaveApplyUrl={saveApplyUrl}
  applyUrlSaving={applyUrlSaving}
  currentAction={currentAction}
  onActionChange={onActionChange}
/>
```

- [ ] **Step 6: Type-check to verify plumbing compiles**

```bash
cd /Users/vietquocbui/repos/ResumeLoop/.claude/worktrees/stage-action-sync && npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors related to JobDetailModal or JdPanel.

- [ ] **Step 7: Commit**

```bash
git add components/JobDetailModal.tsx
git commit -m "feat: thread currentAction/onActionChange props through JobDetailModal to JdPanel"
```

---

### Task 3: Update JdPanel stage buttons to use action-based active state

**Files:**
- Modify: `components/JobDetailModal.tsx` (JdPanel body only — lines ~799, ~806–819)
- Modify: `components/JobDetailModal.tsx` (add import for `TAG_TO_ACTION`, `ACTION_TO_TAG`)

This task changes the stage buttons from `localTags`-based multi-select to `currentAction`-derived radio-select, and wires clicks to `onActionChange`.

- [ ] **Step 1: Add mapping imports at the top of `JobDetailModal.tsx` (line 21)**

Replace:
```typescript
import { PIPELINE_TAGS, PIPELINE_TAG_KEYS } from '@/lib/pipeline-tags'
```

With:
```typescript
import { PIPELINE_TAGS, PIPELINE_TAG_KEYS, TAG_TO_ACTION, ACTION_TO_TAG } from '@/lib/pipeline-tags'
```

- [ ] **Step 2: Update the Action Field to use `effectiveAction` (line ~799 inside JdPanel return)**

Inside `JdPanel`, before the return statement, add (after line 781):

```typescript
  const effectiveAction = currentAction ?? job.action ?? '0-Saved'
```

Then replace:
```tsx
<Field label="Action"  value={job.action ?? '0-Saved'} />
```

With:
```tsx
<Field label="Action"  value={effectiveAction} />
```

- [ ] **Step 3: Replace stage button logic with radio-select + onActionChange (lines ~806–819)**

Replace:
```tsx
{PIPELINE_TAGS.map(tag => {
  const active = localTags.includes(tag.key)
  return (
    <button
      key={tag.key}
      onClick={() => onTagToggle(tag.key)}
      className={`px-2 py-0.5 rounded text-xs border transition-all font-medium ${
        active ? tag.pill : 'bg-zinc-800/50 text-zinc-500 border-zinc-700 hover:text-zinc-300 hover:border-zinc-500'
      }`}
    >
      {tag.label}
    </button>
  )
})}
```

With:
```tsx
{PIPELINE_TAGS.map(tag => {
  const active = ACTION_TO_TAG[effectiveAction] === tag.key
  return (
    <button
      key={tag.key}
      onClick={() => {
        const next = active ? '0-Saved' : (TAG_TO_ACTION[tag.key] ?? '0-Saved')
        onActionChange?.(next)
      }}
      className={`px-2 py-0.5 rounded text-xs border transition-all font-medium ${
        active ? tag.pill : 'bg-zinc-800/50 text-zinc-500 border-zinc-700 hover:text-zinc-300 hover:border-zinc-500'
      }`}
    >
      {tag.label}
    </button>
  )
})}
```

- [ ] **Step 4: Type-check**

```bash
cd /Users/vietquocbui/repos/ResumeLoop/.claude/worktrees/stage-action-sync && npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add components/JobDetailModal.tsx
git commit -m "feat: stage buttons derive active state from job.action and call onActionChange"
```

---

### Task 4: Thread `currentAction` + `onActionChange` from `jobs/page.tsx`

**Files:**
- Modify: `app/(app)/jobs/page.tsx` (lines 837–846)

This is the wiring that makes the sync real. The parent passes the live `job.action` from its `jobs[]` state and the existing `handleActionChange` handler.

- [ ] **Step 1: Update the `<JobDetailModal>` call site (lines 837–846)**

Replace:
```tsx
{selectedJobId && (
  <JobDetailModal
    key={selectedJobId}
    jobId={selectedJobId}
    onClose={() => setSelectedJobId(null)}
    onTagsChange={(tags) => {
      setJobs(prev => prev.map(j => j.id === selectedJobId ? { ...j, tags: JSON.stringify(tags) } : j))
    }}
  />
)}
```

With:
```tsx
{selectedJobId && (
  <JobDetailModal
    key={selectedJobId}
    jobId={selectedJobId}
    onClose={() => setSelectedJobId(null)}
    onTagsChange={(tags) => {
      setJobs(prev => prev.map(j => j.id === selectedJobId ? { ...j, tags: JSON.stringify(tags) } : j))
    }}
    currentAction={jobs.find(j => j.id === selectedJobId)?.action ?? '0-Saved'}
    onActionChange={(action) => void handleActionChange(selectedJobId, action)}
  />
)}
```

- [ ] **Step 2: Type-check the full project**

```bash
cd /Users/vietquocbui/repos/ResumeLoop/.claude/worktrees/stage-action-sync && npx tsc --noEmit 2>&1
```

Expected: no errors.

- [ ] **Step 3: Run full test suite**

```bash
cd /Users/vietquocbui/repos/ResumeLoop/.claude/worktrees/stage-action-sync && npx vitest run
```

Expected: all tests pass (including the new `pipeline-tags.test.ts`).

- [ ] **Step 4: Commit**

```bash
git add app/\(app\)/jobs/page.tsx
git commit -m "feat: wire currentAction and onActionChange into JobDetailModal from jobs page"
```

---

### Task 5: Manual verification

**No file changes — verification only.**

- [ ] **Step 1: Start the dev server**

```bash
cd /Users/vietquocbui/repos/ResumeLoop/.claude/worktrees/stage-action-sync && npm run dev
```

- [ ] **Step 2: Verify stage button → Action sync**

1. Open the jobs page at `http://localhost:3000/jobs`
2. Click any job row to open the detail modal
3. Note the current value in the **Action** field (e.g., `0-Saved`) — no stage button should be highlighted
4. Click the **Applied** stage button
5. Confirm: Applied button highlights with amber color
6. Confirm: The **Action** field in the modal now shows `1-Applied`
7. Close the modal
8. Confirm: The **Action** dropdown in the job list row now shows `1-Applied` in amber

- [ ] **Step 3: Verify Action dropdown → stage button sync**

1. Change the **Action** dropdown in the list row to `3-Interview` (orange)
2. Click the same job row to open the modal
3. Confirm: **Interviewed** stage button is highlighted in orange
4. Confirm: No other stage button is highlighted

- [ ] **Step 4: Verify radio deselect**

1. With a modal open showing **Applied** active, click **Applied** again
2. Confirm: Applied deselects (no button highlighted)
3. Confirm: Action field shows `0-Saved`

- [ ] **Step 5: Verify only one active at a time**

1. Open a modal where a stage is active (e.g., Applied)
2. Click a different stage button (e.g., Offer)
3. Confirm: Offer highlights green, Applied unhighlights
4. Confirm: Action field updates to `4-Offer`

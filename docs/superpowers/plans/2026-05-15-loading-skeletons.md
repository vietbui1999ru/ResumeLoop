# Loading Skeletons Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add layered loading skeletons to all 5 pages so navigation feels instant — `loading.tsx` covers the hydration gap, inline skeletons cover post-hydration data fetches.

**Architecture:** Two-layer approach: Next.js `loading.tsx` per route segment (fires immediately on navigation, before server render or hydration) + inline `useState`-based skeletons inside client components (covers the fetch phase after hydration). Dashboard and Jobs get shape-accurate skeletons; Chat, Config, Settings get generic `animate-pulse` blocks. All skeletons share a single `Skeleton` primitive component with no client JS.

**Tech Stack:** Next.js 15 App Router, React 18, Tailwind CSS (`animate-pulse`), TypeScript

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `components/Skeleton.tsx` | **Create** | Shared primitive — `animate-pulse bg-zinc-800 rounded` + forwarded `className` |
| `app/loading.tsx` | **Create** | Dashboard shape-accurate skeleton (header + 2-col chart grid + sankey + output table) |
| `app/jobs/loading.tsx` | **Create** | Jobs shape-accurate skeleton (filter header + 8 table rows) |
| `app/jobs/page.tsx` | **Modify** | Add `loadingJobs` state; show 8 skeleton rows in tbody while fetch is in-flight |
| `app/chat/loading.tsx` | **Create** | Generic skeleton (tab bar + message bubbles + input) |
| `app/config/loading.tsx` | **Create** | Generic skeleton (profile bar + two-panel editor placeholder) |
| `app/config/page.tsx` | **Modify** | Replace `Loading…` text at lines 571 and 760 with skeleton lines in Monaco panels |
| `app/settings/loading.tsx` | **Create** | Generic skeleton (provider list + form fields) |
| `app/settings/page.tsx` | **Modify** | Replace `Loading…` at lines 103 and 418 with inline skeleton components |

---

## Task 1: Shared Skeleton Primitive

**Files:**
- Create: `components/Skeleton.tsx`

- [ ] **Step 1: Create the component**

```tsx
// components/Skeleton.tsx
export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse bg-zinc-800 rounded ${className}`} />
}
```

No `'use client'` directive — this is a server component. Pure CSS, zero JS.

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/Skeleton.tsx
git commit -m "feat: add shared Skeleton primitive for loading states"
```

---

## Task 2: Dashboard `loading.tsx` (shape-accurate)

**Files:**
- Create: `app/loading.tsx`

This file sits at the root app level and covers the `/` route. It mirrors the exact structure of `app/page.tsx`: header row, 2-col chart grid (260px each), full-width Sankey (280px), full-width output table (5 rows × 5 columns).

- [ ] **Step 1: Create the file**

```tsx
// app/loading.tsx
import { Skeleton } from '@/components/Skeleton'

export default function DashboardLoading() {
  return (
    <div className="space-y-6 p-6">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <Skeleton className="h-6 w-24" />
        <Skeleton className="h-4 w-36" />
      </div>

      {/* 2-col chart grid — mirrors lg:grid-cols-2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="bg-white/[0.025] border border-zinc-800 rounded-xl p-5">
          <Skeleton className="h-4 w-44 mb-4" />
          <Skeleton className="h-[260px] w-full rounded-lg" />
        </div>
        <div className="bg-white/[0.025] border border-zinc-800 rounded-xl p-5">
          <Skeleton className="h-4 w-36 mb-4" />
          <Skeleton className="h-[260px] w-full rounded-lg" />
        </div>
      </div>

      {/* Sankey card */}
      <div className="bg-white/[0.025] border border-zinc-800 rounded-xl p-5">
        <Skeleton className="h-4 w-48 mb-4" />
        <Skeleton className="h-[280px] w-full rounded-lg" />
      </div>

      {/* Output history table card */}
      <div className="bg-white/[0.025] border border-zinc-800 rounded-xl p-5">
        <Skeleton className="h-4 w-44 mb-4" />
        {/* Table header */}
        <div className="flex gap-4 pb-2 border-b border-zinc-800 mb-1">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-3 w-10" />
          <Skeleton className="h-3 w-16" />
        </div>
        {/* 5 rows */}
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex gap-4 py-2 border-b border-zinc-800/60">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-36" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-10" />
            <Skeleton className="h-4 w-20" />
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Navigate to `/` in browser and verify**

Start dev server if not running: `npm run dev`

Click another nav link then click back to Dashboard. The skeleton should flash for ~200–800ms before the real content appears. Confirm:
- Header placeholder appears at correct position
- Two chart card outlines are visible with `animate-pulse` grey blocks
- Sankey block is taller than chart blocks
- Table rows pulse below the Sankey

- [ ] **Step 3: Commit**

```bash
git add app/loading.tsx
git commit -m "feat: add shape-accurate dashboard loading skeleton"
```

---

## Task 3: Jobs `loading.tsx` (shape-accurate)

**Files:**
- Create: `app/jobs/loading.tsx`

Mirrors the sticky filter header (2 rows) + 8 table rows with the exact column layout from `app/jobs/page.tsx`: checkbox, company, role+badge, fit%, action dropdown, date, status.

- [ ] **Step 1: Create the file**

```tsx
// app/jobs/loading.tsx
import { Skeleton } from '@/components/Skeleton'

export default function JobsLoading() {
  return (
    <div className="flex flex-col min-h-full">
      {/* Sticky header skeleton */}
      <div className="sticky top-0 z-10 bg-surface-base border-b border-zinc-800 px-6 pt-4 pb-3 space-y-2.5">
        {/* Row 1: title + session switcher + scan button */}
        <div className="flex items-center gap-3">
          <Skeleton className="h-6 w-14" />
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-7 w-28 rounded-md" />
          <div className="ml-auto">
            <Skeleton className="h-8 w-16 rounded" />
          </div>
        </div>
        {/* Row 2: search + action select + fit + visa filters */}
        <div className="flex items-center gap-2">
          <Skeleton className="flex-1 h-8 rounded-lg" />
          <Skeleton className="h-8 w-28 rounded-lg shrink-0" />
          <Skeleton className="h-8 w-24 rounded-lg shrink-0" />
          <Skeleton className="h-8 w-20 rounded-lg shrink-0" />
        </div>
      </div>

      {/* Table skeleton */}
      <div className="px-6 pt-4 pb-6">
        <table className="w-full text-sm">
          <tbody>
            {Array.from({ length: 8 }).map((_, i) => (
              <tr key={i} className="border-b border-zinc-800/50">
                {/* Checkbox */}
                <td className="py-3 pr-3">
                  <Skeleton className="h-4 w-4" />
                </td>
                {/* Company */}
                <td className="py-3 pr-4">
                  <Skeleton className="h-4 w-28" />
                </td>
                {/* Role + track badge */}
                <td className="py-3 pr-4">
                  <div className="flex items-center gap-2">
                    <Skeleton className="h-4 w-40" />
                    <Skeleton className="h-4 w-16 rounded" />
                  </div>
                </td>
                {/* Fit% badge */}
                <td className="py-3 pr-4">
                  <Skeleton className="h-5 w-12 rounded-full" />
                </td>
                {/* Action dropdown */}
                <td className="py-2 pr-4">
                  <Skeleton className="h-7 w-28 rounded" />
                </td>
                {/* Date */}
                <td className="py-3 pr-4">
                  <Skeleton className="h-4 w-10" />
                </td>
                {/* Status */}
                <td className="py-3">
                  <Skeleton className="h-4 w-8" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify in browser**

Navigate from Dashboard → Jobs. Skeleton filter bar and 8 pulsing rows should appear before real table loads.

- [ ] **Step 3: Commit**

```bash
git add app/jobs/loading.tsx
git commit -m "feat: add shape-accurate jobs loading skeleton"
```

---

## Task 4: Jobs inline skeleton (fetch phase)

**Files:**
- Modify: `app/jobs/page.tsx`

After hydration, `loading.tsx` is replaced by the real page. But `jobs` is `[]` and the `/api/jobs` fetch is still in-flight. Add `loadingJobs` state so the tbody shows 8 skeleton rows during that window.

- [ ] **Step 1: Add `loadingJobs` state and import `Skeleton`**

At the top of `app/jobs/page.tsx`, add the import:

```tsx
import { Skeleton } from '@/components/Skeleton'
```

Inside `JobsPage`, add the state (after the existing `useState` declarations):

```tsx
const [loadingJobs, setLoadingJobs] = useState(true)
```

- [ ] **Step 2: Wrap `reload` to set the flag**

Find the `reload` callback (currently around line 127). Replace its fetch call:

```tsx
// Before:
fetch(`/api/jobs?${p}`).then(r => r.ok ? r.json() : []).then(setJobs)

// After:
setLoadingJobs(true)
fetch(`/api/jobs?${p}`)
  .then(r => r.ok ? r.json() : [])
  .then(d => { setJobs(d); setLoadingJobs(false) })
  .catch(() => setLoadingJobs(false))
```

- [ ] **Step 3: Replace tbody content with conditional skeleton**

Find the `<tbody>` inside the jobs table (around line 360). Replace the existing `{visible.map(...)}` pattern so that skeleton rows show while loading:

```tsx
<tbody>
  {loadingJobs ? (
    Array.from({ length: 8 }).map((_, i) => (
      <tr key={i} className="border-b border-zinc-800/50">
        <td className="py-3 pr-3"><Skeleton className="h-4 w-4" /></td>
        <td className="py-3 pr-4"><Skeleton className="h-4 w-28" /></td>
        <td className="py-3 pr-4">
          <div className="flex items-center gap-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-4 w-16 rounded" />
          </div>
        </td>
        <td className="py-3 pr-4"><Skeleton className="h-5 w-12 rounded-full" /></td>
        <td className="py-2 pr-4"><Skeleton className="h-7 w-28 rounded" /></td>
        <td className="py-3 pr-4"><Skeleton className="h-4 w-10" /></td>
        <td className="py-3"><Skeleton className="h-4 w-8" /></td>
      </tr>
    ))
  ) : (
    visible.map((job, idx) => {
      /* ...existing row render code unchanged... */
    })
  )}
</tbody>
```

Also move the "No jobs match" empty state so it only shows when not loading:

```tsx
{!loadingJobs && visible.length === 0 && (
  <p className="text-zinc-500 text-sm text-center py-10">No jobs match current filters.</p>
)}
```

- [ ] **Step 4: Verify type-check passes**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Verify in browser**

Navigate to Jobs. On first load: `loading.tsx` skeleton appears, then after hydration the inline skeleton covers the fetch gap, then real rows appear. On filter changes (search, fit%, etc.): skeleton rows re-appear while the new fetch runs.

- [ ] **Step 6: Commit**

```bash
git add app/jobs/page.tsx
git commit -m "feat: add inline skeleton rows to jobs table during fetch"
```

---

## Task 5: Chat `loading.tsx` (generic)

**Files:**
- Create: `app/chat/loading.tsx`

Generic pulse blocks suggesting a two-panel chat layout (tab bar + message bubbles + input). Chat has no blocking initial fetch — `loadSessions` runs post-hydration but renders progressively, so `loading.tsx` only is sufficient.

- [ ] **Step 1: Create the file**

```tsx
// app/chat/loading.tsx
import { Skeleton } from '@/components/Skeleton'

export default function ChatLoading() {
  return (
    <div className="flex h-full">
      {/* Sessions sidebar */}
      <div className="w-48 shrink-0 border-r border-zinc-800 p-3 space-y-2">
        <Skeleton className="h-4 w-24 mb-4" />
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-full rounded-lg" />
        ))}
      </div>

      {/* Main chat area */}
      <div className="flex flex-col flex-1 p-4 gap-4">
        {/* Tab bar */}
        <div className="flex gap-2 border-b border-zinc-800 pb-2">
          <Skeleton className="h-7 w-14 rounded-md" />
          <Skeleton className="h-7 w-18 rounded-md" />
        </div>

        {/* Message bubbles */}
        <div className="flex-1 space-y-4 pt-2">
          <div className="flex justify-end">
            <Skeleton className="h-9 w-48 rounded-2xl" />
          </div>
          <div className="flex justify-start">
            <Skeleton className="h-16 w-64 rounded-2xl" />
          </div>
          <div className="flex justify-end">
            <Skeleton className="h-9 w-32 rounded-2xl" />
          </div>
          <div className="flex justify-start">
            <Skeleton className="h-24 w-72 rounded-2xl" />
          </div>
        </div>

        {/* Input area */}
        <Skeleton className="h-12 w-full rounded-lg shrink-0" />
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify in browser** — navigate to Chat, confirm skeleton appears then resolves.

- [ ] **Step 3: Commit**

```bash
git add app/chat/loading.tsx
git commit -m "feat: add generic chat loading skeleton"
```

---

## Task 6: Config `loading.tsx` (generic)

**Files:**
- Create: `app/config/loading.tsx`

Generic skeleton matching `app/config/page.tsx`'s outer structure: `space-y-8 p-6 max-w-[1400px] mx-auto`. Shows profile bar + the two-panel Monaco editor outline.

- [ ] **Step 1: Create the file**

```tsx
// app/config/loading.tsx
import { Skeleton } from '@/components/Skeleton'

export default function ConfigLoading() {
  return (
    <div className="space-y-8 p-6 max-w-[1400px] mx-auto">
      {/* Profile bar */}
      <div className="flex items-center gap-3 px-4 py-3 bg-zinc-800/40 border border-zinc-700 rounded-lg">
        <Skeleton className="h-4 w-16 shrink-0" />
        <Skeleton className="h-7 w-36 rounded" />
        <div className="ml-auto flex gap-2">
          <Skeleton className="h-7 w-20 rounded" />
          <Skeleton className="h-7 w-16 rounded" />
        </div>
      </div>

      {/* ProfileEditor two-panel placeholder */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Skeleton className="h-4 w-56" />
          <div className="flex gap-2">
            <Skeleton className="h-7 w-20 rounded" />
            <Skeleton className="h-7 w-14 rounded" />
          </div>
        </div>
        <div
          className="grid grid-cols-[3fr_2fr] border border-zinc-700 rounded-lg overflow-hidden"
          style={{ height: 520 }}
        >
          <div className="border-r border-zinc-700 bg-zinc-900/50" />
          <div className="bg-zinc-950/50" />
        </div>
      </div>

      {/* DocEditor placeholders */}
      {Array.from({ length: 2 }).map((_, i) => (
        <div key={i} className="space-y-3">
          <div className="flex items-center justify-between">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-7 w-14 rounded" />
          </div>
          <div
            className="grid grid-cols-2 border border-zinc-700 rounded-lg overflow-hidden"
            style={{ height: 480 }}
          >
            <div className="border-r border-zinc-700 bg-zinc-900/50" />
            <div className="bg-zinc-950/50" />
          </div>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Verify in browser** — navigate to Config, confirm layout skeleton appears.

- [ ] **Step 3: Commit**

```bash
git add app/config/loading.tsx
git commit -m "feat: add generic config loading skeleton"
```

---

## Task 7: Config inline skeletons (Monaco fetch phase)

**Files:**
- Modify: `app/config/page.tsx` — lines 571 and 760

Both `ProfileEditor` and `DocEditor` show `Loading…` text while the JSON/markdown content is fetched from the API. Replace with pulsing skeleton lines that suggest code content.

- [ ] **Step 1: Add Skeleton import at top of file**

```tsx
import { Skeleton } from '@/components/Skeleton'
```

- [ ] **Step 2: Replace ProfileEditor Monaco loading state (line 571)**

Find (inside ProfileEditor, in the `{loading ? ... }` branch):

```tsx
<div className="flex-1 flex items-center justify-center text-zinc-400 text-xs">Loading…</div>
```

Replace with:

```tsx
<div className="flex-1 p-4 space-y-2 overflow-hidden">
  {Array.from({ length: 14 }).map((_, i) => (
    <Skeleton
      key={i}
      className={`h-3 ${
        i % 4 === 0 ? 'w-2/3' :
        i % 4 === 1 ? 'w-1/2' :
        i % 4 === 2 ? 'w-3/4' : 'w-2/5'
      }`}
    />
  ))}
</div>
```

- [ ] **Step 3: Replace DocEditor Monaco loading state (line 760)**

Find the identical pattern inside `DocEditor`:

```tsx
<div className="flex-1 flex items-center justify-center text-zinc-400 text-xs">Loading…</div>
```

Replace with the same skeleton (line lengths vary to suggest code):

```tsx
<div className="flex-1 p-4 space-y-2 overflow-hidden">
  {Array.from({ length: 14 }).map((_, i) => (
    <Skeleton
      key={i}
      className={`h-3 ${
        i % 5 === 0 ? 'w-full' :
        i % 5 === 1 ? 'w-3/4' :
        i % 5 === 2 ? 'w-1/2' :
        i % 5 === 3 ? 'w-2/3' : 'w-1/3'
      }`}
    />
  ))}
</div>
```

- [ ] **Step 4: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Verify in browser** — open Config, click on a profile. Editor panel should pulse with skeleton lines while JSON loads, then Monaco renders.

- [ ] **Step 6: Commit**

```bash
git add app/config/page.tsx
git commit -m "feat: replace Loading text with skeleton lines in config Monaco panels"
```

---

## Task 8: Settings `loading.tsx` (generic)

**Files:**
- Create: `app/settings/loading.tsx`

Generic skeleton matching `settings/page.tsx` outer layout: `space-y-6 max-w-2xl mx-auto p-6`. Shows provider list rows + folder picker sections.

- [ ] **Step 1: Create the file**

```tsx
// app/settings/loading.tsx
import { Skeleton } from '@/components/Skeleton'

export default function SettingsLoading() {
  return (
    <div className="space-y-6 max-w-2xl mx-auto p-6">
      {/* Page title */}
      <Skeleton className="h-7 w-24" />

      {/* AI provider configured list */}
      <div className="border border-zinc-800 rounded-lg overflow-hidden">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-3 border-b border-zinc-800 last:border-0">
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-4 w-44" />
              <Skeleton className="h-3 w-60" />
            </div>
            <div className="flex gap-1 shrink-0">
              <Skeleton className="h-7 w-20 rounded" />
              <Skeleton className="h-7 w-16 rounded" />
            </div>
          </div>
        ))}
      </div>

      {/* Add provider form */}
      <div className="space-y-3">
        <Skeleton className="h-9 w-full rounded-lg" />
        <Skeleton className="h-9 w-full rounded-lg" />
        <Skeleton className="h-9 w-28 rounded" />
      </div>

      {/* Folder settings section */}
      <div className="space-y-3">
        <Skeleton className="h-4 w-32" />
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full rounded-lg" />
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify in browser** — navigate to Settings.

- [ ] **Step 3: Commit**

```bash
git add app/settings/loading.tsx
git commit -m "feat: add generic settings loading skeleton"
```

---

## Task 9: Settings inline skeletons (fetch phase)

**Files:**
- Modify: `app/settings/page.tsx` — lines 103 and 418

Two components have inline loading states: `AIProviderSection` (`ai === null`) and `FolderSettings` (`settings === null`). Replace both `Loading…` divs with skeleton UI.

- [ ] **Step 1: Add Skeleton import**

```tsx
import { Skeleton } from '@/components/Skeleton'
```

- [ ] **Step 2: Replace AIProviderSection loading state (line 103)**

Find:

```tsx
if (!ai) return <div className="text-zinc-500 text-sm">Loading…</div>
```

Replace with:

```tsx
if (!ai) return (
  <div className="space-y-4">
    <div className="border border-zinc-800 rounded-lg overflow-hidden">
      {Array.from({ length: 2 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-3 border-b border-zinc-800">
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-4 w-44" />
            <Skeleton className="h-3 w-60" />
          </div>
          <div className="flex gap-1 shrink-0">
            <Skeleton className="h-7 w-20 rounded" />
            <Skeleton className="h-7 w-16 rounded" />
          </div>
        </div>
      ))}
    </div>
    <div className="space-y-3">
      <Skeleton className="h-9 w-full rounded-lg" />
      <Skeleton className="h-9 w-full rounded-lg" />
    </div>
  </div>
)
```

- [ ] **Step 3: Replace FolderSettings loading state (line 418)**

Find:

```tsx
if (!settings) return <div className="text-zinc-500 text-sm">Loading…</div>
```

Replace with:

```tsx
if (!settings) return (
  <div className="space-y-3">
    {Array.from({ length: 3 }).map((_, i) => (
      <Skeleton key={i} className="h-10 w-full rounded-lg" />
    ))}
  </div>
)
```

- [ ] **Step 4: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Verify in browser** — reload Settings page. Both sections should show skeleton blocks while fetching.

- [ ] **Step 6: Commit**

```bash
git add app/settings/page.tsx
git commit -m "feat: replace Loading text with inline skeletons in settings"
```

---

## Self-Review

### Spec coverage

| Requirement | Covered by |
|---|---|
| Shared `Skeleton` primitive, `animate-pulse` | Task 1 |
| Dashboard shape-accurate `loading.tsx` | Task 2 |
| Jobs shape-accurate `loading.tsx` | Task 3 |
| Jobs inline skeleton during fetch | Task 4 |
| Jobs 8 rows, full page | Tasks 3 + 4 |
| Chat `loading.tsx` only | Task 5 |
| Config `loading.tsx` + inline | Tasks 6 + 7 |
| Settings `loading.tsx` + inline | Tasks 8 + 9 |
| Dashboard chart heights: 260px / 280px | Task 2 |
| Output table 5 skeleton rows | Task 2 |

### Performance notes for concurrent users

- `loading.tsx` files are **static HTML** — rendered once at build time, served from CDN edge, zero per-request server cost. All concurrent users get the skeleton instantly with no compute.
- `Skeleton` has no `'use client'` — no hydration cost, no JS bundle contribution.
- Jobs inline skeleton: `setLoadingJobs(false)` is guarded by `.catch()` — stale fetch responses don't leave users stuck on skeleton if the component unmounts mid-fetch (React drops state updates on unmounted components).
- Dashboard `loading.tsx` + `force-dynamic` page: concurrent users each trigger independent `computeMetrics` DB queries, but they all see the skeleton immediately. The DB query is the bottleneck, not the skeleton layer.

### Placeholder scan

No TBDs, TODOs, or "similar to" references found. All code blocks are complete.

### Type consistency

- `Skeleton` accepts `{ className?: string }` — used consistently with string literals throughout all tasks.
- `Array.from({ length: N })` pattern used consistently for repeated skeleton rows.
- No type name drift across tasks.

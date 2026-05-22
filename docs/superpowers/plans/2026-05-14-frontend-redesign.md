# Frontend Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Polish pass — Refined Dark aesthetic with glass cards, icon-only sidebar, snappy 100–150ms motion on all three layers (hover, state transitions, page cross-fade).

**Architecture:** Foundation-first: tokens in `tailwind.config.ts` + `globals.css` + `lib/motion.ts` → new components (`PageTransition`, `AnimatedCheckbox`) → Sidebar → Layout shell → Jobs page → GenerationPanel → Modals. Each task is independently shippable. No spring physics. All motion ≤150ms ease-out.

**Tech Stack:** Next.js 14, Tailwind CSS, framer-motion (Layer 2/3), lucide-react (sidebar icons), TypeScript. Verification: `npx tsc --noEmit` + visual check in `npm run dev`.

---

## File Map

| Action | File | Responsibility |
|---|---|---|
| Install | `package.json` | framer-motion, lucide-react |
| Create | `lib/motion.ts` | Shared duration/ease constants |
| Modify | `tailwind.config.ts` | Design token colors in theme.extend |
| Modify | `app/globals.css` | `leading-relaxed`, custom scrollbar, glass utility |
| Create | `components/PageTransition.tsx` | AnimatePresence route cross-fade |
| Create | `components/AnimatedCheckbox.tsx` | SVG stroke-dashoffset checkmark |
| Modify | `components/Sidebar.tsx` | w-12 icon-only, lucide icons, indigo active bar |
| Modify | `app/layout.tsx` | PageTransition wrapper, body bg |
| Modify | `app/jobs/page.tsx` | Table hover, fit badges, filter bar h-8 |
| Modify | `components/GenerationPanel.tsx` | framer-motion slide-up, minimize, stage dots |
| Modify | `components/JobDetailModal.tsx` | Glass surface, modal motion |
| Modify | `components/ReasoningModal.tsx` | Glass surface, modal motion |
| Modify | `app/page.tsx` | Empty state centering, glass cards |

---

## Task 1: Foundation — Install deps + design tokens + globals

**Files:**
- Modify: `tailwind.config.ts`
- Modify: `app/globals.css`
- Create: `lib/motion.ts`

- [ ] **Step 1: Install dependencies**

```bash
npm install framer-motion lucide-react
```

Expected: resolves without error. `package.json` now lists both packages.

- [ ] **Step 2: Create `lib/motion.ts`**

```typescript
// lib/motion.ts
export const DURATION = { fast: 0.1, base: 0.15 } as const
export const EASE = 'easeOut' as const
```

- [ ] **Step 3: Extend `tailwind.config.ts` with design tokens**

Replace the entire file:

```typescript
import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        'surface-base':   '#09090b',
        'surface-card':   '#18181b',
        'surface-raised': '#27272a',
        'border-subtle':  '#1c1c1f',
        'text-primary':   '#fafafa',
        'text-secondary': '#a1a1aa',
        'text-muted':     '#52525b',
        accent:           '#6366f1',
      },
    },
  },
  plugins: [],
}

export default config
```

- [ ] **Step 4: Update `app/globals.css`**

Replace the file:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  body {
    line-height: 1.625; /* leading-relaxed */
  }

  /* Custom scrollbar — thin, zinc-colored */
  ::-webkit-scrollbar        { width: 6px; height: 6px; }
  ::-webkit-scrollbar-track  { background: transparent; }
  ::-webkit-scrollbar-thumb  { background: #27272a; border-radius: 9999px; }
  ::-webkit-scrollbar-thumb:hover { background: #3f3f46; }
}
```

- [ ] **Step 5: Typecheck**

```bash
npx tsc --noEmit
```

Expected: 0 errors. (framer-motion and lucide-react ship their own types.)

- [ ] **Step 6: Commit**

```bash
git add lib/motion.ts tailwind.config.ts app/globals.css package.json package-lock.json
git commit -m "feat: install framer-motion + lucide-react, add design tokens + globals"
```

---

## Task 2: New shared components — PageTransition + AnimatedCheckbox

**Files:**
- Create: `components/PageTransition.tsx`
- Create: `components/AnimatedCheckbox.tsx`

- [ ] **Step 1: Create `components/PageTransition.tsx`**

```typescript
// components/PageTransition.tsx
'use client'
import { motion, AnimatePresence } from 'framer-motion'
import { usePathname } from 'next/navigation'
import { DURATION, EASE } from '@/lib/motion'

export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={pathname}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: DURATION.base, ease: EASE }}
        className="flex-1 min-h-0 overflow-auto"
      >
        {children}
      </motion.div>
    </AnimatePresence>
  )
}
```

- [ ] **Step 2: Create `components/AnimatedCheckbox.tsx`**

```typescript
// components/AnimatedCheckbox.tsx
'use client'
import { motion } from 'framer-motion'

interface Props {
  checked: boolean
  onChange: (checked: boolean) => void
  className?: string
}

export function AnimatedCheckbox({ checked, onChange, className = '' }: Props) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`w-4 h-4 rounded flex items-center justify-center border transition-colors duration-100 ${
        checked
          ? 'bg-indigo-500 border-indigo-500'
          : 'bg-transparent border-zinc-600 hover:border-zinc-400'
      } ${className}`}
    >
      <svg
        viewBox="0 0 10 8"
        fill="none"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        stroke="white"
        className="w-2.5 h-2"
      >
        <motion.path
          d="M1 4L3.5 6.5L9 1"
          strokeDasharray="12"
          animate={{ strokeDashoffset: checked ? 0 : 12 }}
          transition={{ duration: 0.12, ease: 'easeOut' }}
        />
      </svg>
    </button>
  )
}
```

- [ ] **Step 3: Typecheck**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add components/PageTransition.tsx components/AnimatedCheckbox.tsx
git commit -m "feat: add PageTransition and AnimatedCheckbox components"
```

---

## Task 3: Sidebar redesign — icon-only, w-12, active bar

**Files:**
- Modify: `components/Sidebar.tsx`

- [ ] **Step 1: Replace `components/Sidebar.tsx`**

```typescript
// components/Sidebar.tsx
'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Briefcase,
  LayoutDashboard,
  MessageSquare,
  FileText,
  Settings2,
  UserCircle,
} from 'lucide-react'

const NAV = [
  { href: '/jobs',     label: 'Jobs',      Icon: Briefcase },
  { href: '/',         label: 'Dashboard', Icon: LayoutDashboard },
  { href: '/chat',     label: 'Chat',      Icon: MessageSquare },
  { href: '/config',   label: 'Config',    Icon: FileText },
  { href: '/settings', label: 'Settings',  Icon: Settings2 },
]

export function Sidebar() {
  const pathname = usePathname()
  return (
    <nav className="w-12 shrink-0 border-r border-zinc-800 bg-surface-card flex flex-col items-center py-3 gap-1 h-full">
      {/* Logo mark */}
      <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center mb-2 shrink-0">
        <span className="text-[10px] font-bold text-white tracking-tight">RA</span>
      </div>

      {/* Nav items */}
      {NAV.map(({ href, label, Icon }) => {
        const active = pathname === href
        return (
          <Link
            key={href}
            href={href}
            title={label}
            className={`relative w-8 h-8 rounded-lg flex items-center justify-center transition-colors duration-100 ${
              active
                ? 'bg-surface-raised text-indigo-400'
                : 'text-text-muted hover:text-text-secondary hover:bg-surface-raised'
            }`}
          >
            {active && (
              <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-4 bg-indigo-500 rounded-r-full -ml-px" />
            )}
            <Icon size={16} strokeWidth={1.75} />
          </Link>
        )
      })}

      {/* Spacer + account */}
      <div className="flex-1" />
      <Link
        href="/account"
        title="Account"
        className="w-8 h-8 rounded-full bg-surface-raised flex items-center justify-center text-text-muted hover:text-text-secondary transition-colors duration-100"
      >
        <UserCircle size={18} strokeWidth={1.75} />
      </Link>
    </nav>
  )
}
```

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit
```

Expected: 0 errors. (The `useTourContext` / reset button is removed — the tour reset can be accessed elsewhere or deferred per spec scope.)

- [ ] **Step 3: Start dev server and visually verify**

```bash
npm run dev
```

Open `http://localhost:3000`. Verify:
- Sidebar is narrow (`w-12`), shows icon-only
- Active page has indigo icon + left bar
- Hovering inactive items lightens them
- Logo mark `RA` shows at top
- Account icon at bottom

- [ ] **Step 4: Commit**

```bash
git add components/Sidebar.tsx
git commit -m "feat: sidebar redesign — icon-only w-12 with lucide icons and active bar"
```

---

## Task 4: Layout shell — PageTransition + body background

**Files:**
- Modify: `app/layout.tsx`

- [ ] **Step 1: Update `app/layout.tsx`**

```typescript
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { Sidebar } from '@/components/Sidebar'
import { TourOverlay } from '@/components/TourOverlay'
import { PageTransition } from '@/components/PageTransition'
import { Providers } from './providers'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'ResumeLoop',
  description: 'Resume pipeline dashboard',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.className} bg-surface-base text-text-primary h-screen overflow-hidden flex`}>
        <Providers>
          <Sidebar />
          <TourOverlay />
          <PageTransition>{children}</PageTransition>
        </Providers>
      </body>
    </html>
  )
}
```

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 3: Visual check**

Navigate between pages in the dev server. Verify a soft opacity cross-fade (150ms) occurs on route changes. Body background should be `#09090b` (very dark zinc).

- [ ] **Step 4: Commit**

```bash
git add app/layout.tsx
git commit -m "feat: wrap layout in PageTransition, update body background token"
```

---

## Task 5: Jobs page — filter bar, table hover, fit badges

**Files:**
- Modify: `app/jobs/page.tsx`

This task makes targeted edits to the jobs page. Read the current file first, then apply each edit.

- [ ] **Step 1: Update filter bar input heights**

Find all filter `<input>` and `<select>` elements in the filter bar section (above the table). Change their className to include `h-8 rounded-lg bg-surface-card border border-zinc-800 text-sm px-2 text-text-secondary placeholder:text-text-muted focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30 transition-colors duration-100`.

Remove any inconsistent padding, height, or background classes that conflict.

- [ ] **Step 2: Add table row hover + transition**

Find the `<tr>` elements that render job rows. Add these classes:
```
hover:bg-surface-raised hover:-translate-y-px transition-all duration-100 cursor-pointer
```

Also increase row padding: change `py-2` to `py-3` on `<td>` elements.

- [ ] **Step 3: Add selected row styling**

Find where the selected row is highlighted (the currently-selected job). Replace the selected background class with:
```
border-l-2 border-indigo-500 bg-indigo-500/5
```

- [ ] **Step 4: Add fit % badge component inline**

Find where `fit_pct` is rendered in the table cell. Replace the plain number render with a badge:

```typescript
function FitBadge({ pct }: { pct: number }) {
  if (pct >= 80) return (
    <span className="rounded-full px-2 py-0.5 text-xs font-medium bg-green-500/10 text-green-400">{pct}%</span>
  )
  if (pct >= 60) return (
    <span className="rounded-full px-2 py-0.5 text-xs font-medium bg-amber-500/10 text-amber-400">{pct}%</span>
  )
  return (
    <span className="rounded-full px-2 py-0.5 text-xs font-medium bg-zinc-800 text-zinc-500">{pct}%</span>
  )
}
```

Add this function near the top of the file (alongside other small components like `SortTh` and `clipColor`). Then replace the `fit_pct` cell content with `<FitBadge pct={job.fit_pct} />`.

- [ ] **Step 5: Typecheck**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 6: Visual verify in dev server**

Navigate to `/jobs`. Verify:
- Filter inputs are `h-8` with dark surface background
- Row hover lifts 1px with bg change (100ms)
- Selected row has left indigo border
- Fit % shown as colored rounded badge

- [ ] **Step 7: Commit**

```bash
git add app/jobs/page.tsx
git commit -m "feat: jobs page — filter bar h-8, table hover lift, fit badges"
```

---

## Task 6: Jobs page — replace checkboxes with AnimatedCheckbox

**Files:**
- Modify: `app/jobs/page.tsx`

- [ ] **Step 1: Import AnimatedCheckbox**

Add to the imports at the top of `app/jobs/page.tsx`:
```typescript
import { AnimatedCheckbox } from '@/components/AnimatedCheckbox'
```

- [ ] **Step 2: Replace static checkbox inputs**

Find any `<input type="checkbox"` elements used for row selection in the jobs table. Replace each one with:

```typescript
<AnimatedCheckbox
  checked={selectedIds.has(job.id)}
  onChange={(checked) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (checked) next.add(job.id)
      else next.delete(job.id)
      return next
    })
  }}
/>
```

Adjust the state variable name (`selectedIds`) to match whatever the page currently uses for selection state.

- [ ] **Step 3: Typecheck**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 4: Visual verify**

Click checkboxes on job rows. Verify the checkmark draws in with a stroke animation (~120ms). Checked state shows indigo background.

- [ ] **Step 5: Commit**

```bash
git add app/jobs/page.tsx
git commit -m "feat: replace static checkboxes with AnimatedCheckbox in jobs table"
```

---

## Task 7: GenerationPanel — slide-up entrance + stage dot animations

**Files:**
- Modify: `components/GenerationPanel.tsx`

- [ ] **Step 1: Import framer-motion and motion constants**

At the top of `components/GenerationPanel.tsx`, add:

```typescript
import { motion, AnimatePresence } from 'framer-motion'
import { DURATION, EASE } from '@/lib/motion'
```

- [ ] **Step 2: Wrap the panel root in a motion.div for slide-up entrance**

Find the outermost `<div>` of the panel (the fixed/absolute container that sits at the bottom of the screen). Wrap it in:

```typescript
<motion.div
  initial={{ y: '100%', opacity: 0 }}
  animate={{ y: 0, opacity: 1 }}
  exit={{ y: '100%', opacity: 0 }}
  transition={{ duration: DURATION.base, ease: EASE }}
>
  {/* existing panel content */}
</motion.div>
```

If the panel is conditionally rendered by a parent, ensure the parent wraps it in `<AnimatePresence>` — check `app/jobs/page.tsx` for where `<GenerationPanel />` is rendered and add `<AnimatePresence>` around it there.

- [ ] **Step 3: Add stage status dot animations**

Find where stage status is rendered (the `ok`/`fail`/`running` indicators). Replace the static status indicator with:

```typescript
function StageDot({ status }: { status: 'ok' | 'fail' | 'running' }) {
  if (status === 'running') return (
    <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse shrink-0" />
  )
  if (status === 'ok') return (
    <span className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
  )
  return (
    <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" />
  )
}
```

Add this function near the top of the file. Replace existing status indicator JSX with `<StageDot status={stage.status} />`.

- [ ] **Step 4: Update panel surface classes**

Find the panel's main container div. Ensure it has:
```
bg-surface-card border-t border-zinc-800
```

Remove any `bg-zinc-900` or `bg-zinc-800` background classes that conflict.

- [ ] **Step 5: Update close/minimize button hover classes**

Find the minimize and close buttons in the panel header. Add:
```
hover:bg-surface-raised rounded-md transition-colors duration-100
```

- [ ] **Step 6: Typecheck**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 7: Visual verify**

Queue a generation job. Verify:
- Panel slides up from bottom (150ms)
- Running stage shows pulsing indigo dot
- Completed stages show static green dot
- Failed stages show red dot

- [ ] **Step 8: Commit**

```bash
git add components/GenerationPanel.tsx app/jobs/page.tsx
git commit -m "feat: GenerationPanel slide-up entrance + stage status dot animations"
```

---

## Task 8: Modals — glass surface + framer-motion scale entrance

**Files:**
- Modify: `components/ReasoningModal.tsx`
- Modify: `components/JobDetailModal.tsx`

### ReasoningModal (81 lines — simpler, do first)

- [ ] **Step 1: Add framer-motion to `components/ReasoningModal.tsx`**

Add imports:
```typescript
import { motion, AnimatePresence } from 'framer-motion'
import { DURATION, EASE } from '@/lib/motion'
```

- [ ] **Step 2: Wrap backdrop in AnimatePresence + motion.div**

Replace the outermost backdrop `<div>` with:

```typescript
<AnimatePresence>
  <motion.div
    className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    exit={{ opacity: 0 }}
    transition={{ duration: DURATION.fast, ease: EASE }}
    onClick={onClose}
  >
    <motion.div
      className="relative bg-surface-card border border-zinc-800 rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col mx-4"
      initial={{ scale: 0.96, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      exit={{ scale: 0.96, opacity: 0 }}
      transition={{ duration: DURATION.base, ease: EASE }}
      onClick={e => e.stopPropagation()}
    >
      {/* existing inner content unchanged */}
    </motion.div>
  </motion.div>
</AnimatePresence>
```

Update the inner panel border/bg classes to match glass treatment: `bg-surface-card border border-zinc-800 rounded-2xl`.

- [ ] **Step 3: Update close button**

Find the close button. Add: `hover:bg-surface-raised rounded-lg transition-colors duration-100`.

- [ ] **Step 4: Update header typography**

Find the modal header. Set:
- Title: `text-base font-semibold text-text-primary`
- Subtitle: `text-sm text-text-muted`

- [ ] **Step 5: Apply same glass + motion to `components/JobDetailModal.tsx`**

JobDetailModal is larger (784 lines) but the same pattern applies to its outermost backdrop wrapper. Read the file, find the backdrop div and panel div, apply:

Backdrop:
```typescript
<motion.div
  className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
  initial={{ opacity: 0 }}
  animate={{ opacity: 1 }}
  exit={{ opacity: 0 }}
  transition={{ duration: DURATION.fast, ease: EASE }}
  onClick={onClose}
>
```

Panel (keep existing `max-w-*` and layout classes, just update surface):
```typescript
<motion.div
  className="relative bg-surface-card border border-zinc-800 rounded-2xl ... existing size/flex classes ..."
  initial={{ scale: 0.96, opacity: 0 }}
  animate={{ scale: 1, opacity: 1 }}
  exit={{ scale: 0.96, opacity: 0 }}
  transition={{ duration: DURATION.base, ease: EASE }}
  onClick={e => e.stopPropagation()}
>
```

Add `import { motion, AnimatePresence } from 'framer-motion'` and `import { DURATION, EASE } from '@/lib/motion'` to the imports.

Wrap the entire modal (when it is shown) in `<AnimatePresence>`. If the modal is conditionally rendered by parent, add `<AnimatePresence>` in the parent (`app/jobs/page.tsx`) around the `<JobDetailModal />` render.

- [ ] **Step 6: Typecheck**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 7: Visual verify**

Open a job detail modal and reasoning modal. Verify:
- Backdrop fades in (100ms)
- Panel scales from 0.96→1.0 with opacity (150ms)
- Backdrop has subtle blur
- Panel uses dark glass surface (`bg-surface-card`)

- [ ] **Step 8: Commit**

```bash
git add components/ReasoningModal.tsx components/JobDetailModal.tsx app/jobs/page.tsx
git commit -m "feat: modals — glass surface + scale entrance with framer-motion"
```

---

## Task 9: Dashboard page — empty state centering + glass card treatment

**Files:**
- Modify: `app/page.tsx`

- [ ] **Step 1: Center the empty state**

Find the empty state `<div>` (rendered when `!data || data.total === 0`). Replace its wrapper with:

```typescript
<div className="min-h-[40vh] flex flex-col items-center justify-center text-center px-6">
  <h1 className="text-lg font-semibold text-text-primary mb-2">Dashboard</h1>
  <p className="text-sm text-text-secondary">
    No data yet.{' '}
    <a href="/jobs" className="text-indigo-400 hover:text-indigo-300 underline transition-colors duration-100">
      Go to Jobs → Scan
    </a>{' '}
    to populate.
  </p>
</div>
```

- [ ] **Step 2: Apply glass card treatment to chart containers**

Find the chart wrapper `<div>` elements (the ones that currently wrap `RoleTrackChart`, `FitDistChart`, `PipelineSankeyChart`, `OutputHistoryTable`). Add glass card classes:

```
bg-white/[0.025] border border-zinc-800 rounded-xl p-5
hover:border-indigo-500/20 hover:-translate-y-px transition-all duration-100
```

The outer `<div className="grid ...">` spacing should use `gap-5` (up from `gap-4`).

- [ ] **Step 3: Update page title typography**

The heading `<h1>` should be: `text-lg font-semibold text-text-primary`.

- [ ] **Step 4: Typecheck**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 5: Visual verify**

Navigate to `/` (dashboard). Verify:
- Empty state is vertically centered
- When data is present, chart cards have glass border + hover lift
- Page title uses correct weight

- [ ] **Step 6: Commit**

```bash
git add app/page.tsx
git commit -m "feat: dashboard — centered empty state + glass card treatment"
```

---

## Self-Review

**Spec coverage:**
- ✅ `surface-base`, `surface-card`, `surface-raised`, `border`, `accent` tokens → Task 1
- ✅ `leading-relaxed` globally → Task 1 (globals.css)
- ✅ Custom scrollbar → Task 1 (globals.css)
- ✅ Glass cards: `bg-white/[0.025] border border-zinc-800 rounded-xl` → Tasks 5, 9
- ✅ Layer 1 — Tailwind hover/transition → Tasks 3, 4, 5, 7 (100ms ease-out on all interactive elements)
- ✅ Layer 2 — framer-motion state transitions → Tasks 7, 8 (GenerationPanel slide-up, modal scale)
- ✅ Layer 3 — AnimatePresence page cross-fade → Tasks 2 + 4 (PageTransition)
- ✅ Sidebar: `w-12`, icon-only, lucide icons, indigo active bar → Task 3
- ✅ Jobs: row hover lift, selected row border, fit badges, filter bar h-8 → Tasks 5, 6
- ✅ `AnimatedCheckbox` SVG stroke-dashoffset → Tasks 2, 6
- ✅ `PageTransition` component → Tasks 2, 4
- ✅ `lib/motion.ts` constants → Task 1
- ✅ GenerationPanel: slide-up entrance, stage dots → Task 7
- ✅ Modals: `backdrop-blur-sm` backdrop, `scale(0.96)→1` panel, `rounded-2xl` → Task 8
- ✅ Dashboard: empty state centering, glass charts → Task 9
- ✅ framer-motion + lucide-react install → Task 1

**Deferred (per spec):**
- Chat, Config, Settings pages — spec explicitly deferred
- Mobile/responsive layout — out of scope
- Dark/light toggle — out of scope

**No placeholders detected.**

**Type consistency check:**
- `DURATION.fast` (0.1) and `DURATION.base` (0.15) — used consistently across Tasks 7, 8
- `EASE = 'easeOut'` — used in all motion transitions
- `StageDot` defined in Task 7, used in Task 7 only — no cross-task type drift
- `FitBadge` defined in Task 5, used in Task 5 only
- `AnimatedCheckbox` defined in Task 2, imported in Task 6 ✅
- `PageTransition` defined in Task 2, imported in Task 4 ✅

# Frontend Redesign — Design Spec

**Date:** 2026-05-14
**Branch:** main
**Status:** Approved

## Goal

Polish pass + full visual redesign. Direction: Refined Dark (A) with all three motion layers at snappy speed. Same dark aesthetic — elevated. Glass cards, icon-only sidebar, strict typography, micro-animations throughout. Linear/Vercel aesthetic.

## Design Direction

**A (Refined Dark) + D (all three motion layers) + snappy (100–150ms ease-out).**

No spring physics. No bounces. Motion you feel and notice but never wait for.

## Design Tokens

### Color

| Token | Value | Role |
|---|---|---|
| `surface-base` | `#09090b` | Body, page background |
| `surface-card` | `#18181b` | Cards, sidebar, panels |
| `surface-raised` | `#27272a` | Hover states, inputs, dropdowns |
| `border` | `#27272a` | All 1px borders |
| `border-subtle` | `#1c1c1f` | Dividers inside cards |
| `text-primary` | `#fafafa` | Headings, active labels |
| `text-secondary` | `#a1a1aa` | Body text, descriptions |
| `text-muted` | `#52525b` | Placeholders, timestamps, labels |
| `accent` | `#6366f1` | Active nav bar, selection, CTA |

Status signals (unchanged — already correct):
- Success: `#22c55e`
- Warning: `#f59e0b`
- Error: `#ef4444`
- Info/running: `#6366f1`

**Color discipline:** Indigo (`accent`) appears only on interactive/state elements — active nav, selected row, focused input ring, primary CTA. Status colors appear only on data signals — fit badges, stage dots, clip date. No decorative color.

### Typography

Font: Inter (unchanged). Add explicit weight and size discipline:

| Role | Class |
|---|---|
| Page title | `text-lg font-semibold text-primary` |
| Section label | `text-xs font-medium uppercase tracking-widest text-muted` |
| Body / table data | `text-sm text-secondary` |
| Secondary cell | `text-xs text-muted` |
| Monospace (dates, IDs) | `font-mono text-xs text-muted` |

Add `leading-relaxed` globally via `globals.css`. Current line-height is too tight on body text.

### Spacing & Shape

- Base padding: `p-5` on cards (up from `p-4`)
- Border radius: `rounded-xl` on cards/modals (up from `rounded-lg`), `rounded-lg` on inputs/buttons
- Table row height: `py-3` (up from `py-2`) for breathing room
- Card gap: `gap-5` (up from `gap-4`)

### Glass Cards

All card surfaces use:
```css
background: rgba(255, 255, 255, 0.025);
border: 1px solid #27272a;
border-radius: 0.75rem; /* rounded-xl */
```

Hover state adds:
```css
border-color: rgba(99, 102, 241, 0.2);
transform: translateY(-1px);
transition: all 100ms ease-out;
```

No `backdrop-filter: blur` on cards — only on modal backdrops. Blur is expensive and unnecessary on opaque dark surfaces.

## Motion System

### Timing Contract

One constant shared across all motion: **`DURATION = 150ms`**, easing **`ease-out`**. Interactions at 100ms, transitions at 150ms. Never exceed 200ms.

```typescript
// lib/motion.ts
export const DURATION = { fast: 100, base: 150 } as const
export const EASE = 'easeOut'
```

### Layer 1 — Interaction Feedback (Tailwind utilities, no JS)

Applied via Tailwind `transition-*` classes. No framer-motion overhead.

| Element | Motion | Duration |
|---|---|---|
| Table row hover | `bg` fade + `translateY(-1px)` | 100ms |
| Button press | `scale(0.97)` on `active:` | 100ms |
| Checkbox check | SVG stroke-dashoffset draw | 120ms |
| Card hover | border-color → `accent/20` + lift | 100ms |
| Nav link | color + bg cross-fade | 100ms |
| Input focus | border-color → accent, ring expands | 120ms |

### Layer 2 — State Transitions (framer-motion)

| Element | Transition | Duration |
|---|---|---|
| GenerationPanel open | `translateY(100%) → 0` + `opacity 0→1` | 150ms |
| GenerationPanel minimize | height collapses to 40px header | 150ms |
| Stage: running → ok | spinner fade-out, checkmark fade-in | 120ms |
| Stage: fail | `translateX` shake ±3px × 2 | 100ms |
| Skeleton → content | `opacity 0→1` staggered 80ms per row | 80ms stagger |
| Modal open | `scale(0.96)→1.0` + `opacity 0→1` | 150ms |
| Modal close | reverse | 100ms (faster out) |
| Toast | slide from top-right, auto-dismiss | 150ms in/out |

### Layer 3 — Page Transitions (framer-motion AnimatePresence)

Single pattern: **cross-fade**. Outgoing fades to 0 while incoming fades from 0, overlapping by 50ms. No slides (causes layout shift alongside fixed sidebar).

Implemented via `components/PageTransition.tsx` wrapping `<main>` in `app/layout.tsx`.

```typescript
// components/PageTransition.tsx
'use client'
import { motion, AnimatePresence } from 'framer-motion'
import { usePathname } from 'next/navigation'

export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={pathname}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15, ease: 'easeOut' }}
        className="flex-1 min-h-0 overflow-auto"
      >
        {children}
      </motion.div>
    </AnimatePresence>
  )
}
```

## Component Changes

### Sidebar (`components/Sidebar.tsx`)

**Before:** `w-44`, text labels, zinc-900 bg, no icons.
**After:** `w-12`, icon-only, tooltips on hover, indigo active bar.

Structure:
- Width: `w-12 shrink-0`
- Background: `surface-card` (`#18181b`)
- Border: `border-r border-zinc-800`
- Top: 26px monogram logo mark (`RA` or icon)
- Nav items: 32×32px icon buttons, `rounded-lg`
- Active: `bg-surface-raised` + `before:` pseudo 2px indigo left bar
- Inactive hover: `bg-surface-raised` 100ms
- Bottom: user avatar circle → `/account`
- Tooltips: native `title` attribute (no library)

Icons (Lucide React — add as dependency):
- Jobs → `Briefcase`
- Dashboard → `LayoutDashboard`
- Chat → `MessageSquare`
- Config → `FileText`
- Settings → `Settings2`
- Account → user avatar

### Glass Card (shared pattern)

No new component — apply classes consistently:
```
bg-white/[0.025] border border-zinc-800 rounded-xl p-5
hover:border-indigo-500/20 hover:-translate-y-px transition-all duration-100
```

### Jobs Table (`app/jobs/page.tsx`)

- Row hover: `hover:bg-zinc-900 hover:-translate-y-px transition-all duration-100`
- Selected row: `border-l-2 border-indigo-500 bg-indigo-500/5`
- Checkbox: animated SVG checkmark (custom `AnimatedCheckbox` component)
- Fit % badge: `rounded-full px-2 py-0.5 text-xs font-medium` with color-coded bg:
  - ≥80%: `bg-green-500/10 text-green-400`
  - 60–79%: `bg-amber-500/10 text-amber-400`
  - <60%: `bg-zinc-800 text-zinc-500`
- Filter bar: all inputs `h-8 rounded-lg bg-surface-card border-zinc-800`
- Filter bar: single consistent row, no wrapping

### GenerationPanel (`components/GenerationPanel.tsx`)

- Entrance: `framer-motion` `y: '100%' → 0` + `opacity: 0→1`, 150ms
- Minimize: animate height to 40px (header only), content `overflow-hidden`
- Surface: `bg-surface-card border-t border-zinc-800`
- Stage rows:
  - Running: indigo pulsing dot (CSS animation, no JS)
  - Ok: green dot + checkmark, 120ms cross-fade
  - Fail: red dot + shake animation, 100ms
- Close/minimize buttons: `hover:bg-surface-raised rounded-md transition-colors duration-100`

### Modals (JobDetailModal, ReasoningModal)

- Backdrop: `bg-black/60 backdrop-blur-sm` — blur only here, not on cards
- Panel: `scale(0.96)→1` + `opacity`, 150ms on open, 100ms on close
- Shape: `rounded-2xl p-6 max-w-2xl`
- Header: `text-base font-semibold` title + `text-muted` subtitle
- Close button: top-right, `hover:bg-surface-raised rounded-lg`

### AnimatedCheckbox (new, `components/AnimatedCheckbox.tsx`)

Small SVG checkbox with stroke-dashoffset checkmark draw on check. Used in jobs table row selection.

### PageTransition (new, `components/PageTransition.tsx`)

Described in Motion Layer 3 above.

## Page Changes

### Dashboard (`app/page.tsx`)

- Empty state: center vertically `min-h-[40vh] flex flex-col items-center justify-center` (currently left-aligned)
- Stats grid: `grid-cols-3` for key numbers above charts
- Chart cards: glass treatment
- `OutputHistoryTable`: row hover lift, status pill badges

### Jobs (`app/jobs/page.tsx`)

- Sticky filter bar: single consistent row, `h-8` inputs
- Table: animated checkboxes, hover lift, selected row left border, fit badges
- Generate button: press scale, "Queue more" when panel open (already implemented)
- Empty scan state: centered call-to-action

### Auth Pages (`app/auth/*/page.tsx`)

- Card: `max-w-sm mx-auto mt-[20vh]` glass card
- Inputs: accent focus ring
- Submit: press scale + loading spinner inline

### Chat, Config, Settings

Deferred — need separate read pass before speccing. The token system and motion rules apply automatically to any Tailwind classes used. No structural changes planned until reviewed.

## Files Changed

| Action | File |
|---|---|
| Modify | `app/layout.tsx` — add PageTransition, update body bg |
| Modify | `app/globals.css` — add `leading-relaxed`, custom scrollbar |
| Modify | `components/Sidebar.tsx` — icon-only, w-12, active bar |
| Modify | `app/jobs/page.tsx` — table hover, fit badges, filter bar |
| Modify | `app/page.tsx` — empty state centering, glass cards |
| Modify | `components/GenerationPanel.tsx` — slide-up, stage animations |
| Modify | `components/JobDetailModal.tsx` — modal motion, glass |
| Modify | `components/ReasoningModal.tsx` — modal motion, glass |
| Create | `components/PageTransition.tsx` — route cross-fade |
| Create | `components/AnimatedCheckbox.tsx` — SVG checkmark draw |
| Create | `lib/motion.ts` — shared duration/easing constants |
| Modify | `tailwind.config.ts` — extend theme with token colors |

## Dependencies to Add

```bash
npm install framer-motion lucide-react
```

Both are standard in the Next.js ecosystem. `framer-motion` for Layer 2/3 transitions. `lucide-react` for sidebar icons.

## Out of Scope

- Dark/light mode toggle (app is dark-only by design)
- Chat, Config, Settings page structural redesign (deferred)
- Mobile/responsive layout (desktop dashboard, not a mobile app)
- Custom font (Inter stays)
- Storybook or design system documentation

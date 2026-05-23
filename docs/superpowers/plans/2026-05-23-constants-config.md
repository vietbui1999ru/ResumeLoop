# Design Tokens & Constants Config — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract all repeated hardcoded visual constants into CSS custom properties in `globals.css`, bridge them to Tailwind via `var()` references in `tailwind.config.ts`, and expose typed JS exports in `lib/tokens.ts` for Recharts chart components.

**Architecture:** `globals.css :root` defines all raw token values. `tailwind.config.ts` references them via `rgb(var(--color-*) / <alpha-value>)` so Tailwind opacity modifiers work. `lib/tokens.ts` exports the same values as typed hex strings for SSR-safe JS consumption. Three chart components are migrated to import from `lib/tokens.ts` — no logic changes, only constant references change.

**Tech Stack:** Next.js 14, TypeScript, Tailwind CSS v3, Recharts

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `app/globals.css` | Modify | Source of truth — all CSS custom properties |
| `tailwind.config.ts` | Modify | Bridge — `var()` refs for Tailwind utilities |
| `lib/tokens.ts` | Create | SSR-safe typed JS exports for chart components |
| `components/PipelineSankeyChart.tsx` | Modify | Consume `CHART_COLORS`, `SURFACE_COLORS`, `BORDER_COLORS`, `SEMANTIC_COLORS` |
| `components/FitDistChart.tsx` | Modify | Consume `TEXT_COLORS`, `SURFACE_COLORS`, `BORDER_COLORS` |
| `components/RoleTrackChart.tsx` | Modify | Consume `TEXT_COLORS`, `SURFACE_COLORS`, `BORDER_COLORS`, `CHART_COLORS` |

---

## Task 1: Define CSS custom properties in globals.css

**Files:**
- Modify: `app/globals.css`

- [ ] **Step 1: Add the `:root` token block to globals.css**

Open `app/globals.css`. Add the following block inside `@layer base`, immediately before the `html { ... }` rule:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

/* Tour highlight ring — pulsing indigo glow on the focused component */
@keyframes tour-highlight-pulse {
  0%, 100% {
    box-shadow:
      0 0 0 2px rgb(99 102 241),
      0 0 0 5px rgba(99,102,241,0.35),
      0 0 24px 6px rgba(99,102,241,0.18);
  }
  50% {
    box-shadow:
      0 0 0 2px rgb(129 140 248),
      0 0 0 8px rgba(99,102,241,0.2),
      0 0 40px 12px rgba(99,102,241,0.28);
  }
}

@layer base {
  /* === Design Tokens ===
   * Bare RGB channels for surface/text/border/semantic — enables Tailwind opacity
   * modifiers (bg-surface-card/50). Full hex for chart palette — Recharts only.
   * To change a value: update here AND the matching export in lib/tokens.ts.
   */
  :root {
    /* Surface */
    --color-surface-base:    9 9 11;
    --color-surface-card:    24 24 27;
    --color-surface-raised:  39 39 42;
    --color-surface-overlay: 63 63 70;

    /* Border */
    --color-border-subtle:   28 28 31;
    --color-border-default:  63 63 70;
    --color-border-strong:   82 82 91;

    /* Text */
    --color-text-primary:    250 250 250;
    --color-text-secondary:  161 161 170;
    --color-text-muted:      82 82 91;

    /* Semantic */
    --color-accent:          99 102 241;
    --color-accent-light:    129 140 248;
    --color-accent-subtle:   30 27 75;
    --color-error:           248 113 113;
    --color-success:         74 222 128;
    --color-warning:         251 191 36;

    /* Chart palette — full hex, consumed by lib/tokens.ts → Recharts only */
    --color-chart-scraped:      #6366f1;
    --color-chart-proceed:      #818cf8;
    --color-chart-resume-built: #3b82f6;
    --color-chart-applied:      #fbbf24;
    --color-chart-interviewed:  #fb923c;
    --color-chart-offer:        #4ade80;
    --color-chart-rejected:     #f87171;
    --color-chart-visa-kill:    #f43f5e;
    --color-chart-pending:      #71717a;
    --color-chart-other:        #52525b;

    /* Typography */
    --font-sans: system-ui, -apple-system, sans-serif;
    --font-mono: ui-monospace, SFMono-Regular, monospace;

    /* Border Radius */
    --radius-sm:   0.25rem;
    --radius-md:   0.375rem;
    --radius-lg:   0.5rem;
    --radius-xl:   0.75rem;
    --radius-2xl:  1rem;
    --radius-full: 9999px;

    /* Shadows */
    --shadow-sm:    0 1px 2px rgb(0 0 0 / 0.5);
    --shadow-card:  0 20px 25px -5px rgb(0 0 0 / 0.5), 0 8px 10px -6px rgb(0 0 0 / 0.5);
    --shadow-modal: 0 25px 50px -12px rgb(0 0 0 / 0.7);
  }

  html {
    --font-scale: 1.15; /* medium default */
    font-size: calc(var(--font-scale) * 100%);
  }

  /* Class-based fallback (kept for init script / SSR compat). */
  html.font-small  { font-size: 100%; }
  html.font-medium { font-size: 115%; }
  html.font-large  { font-size: 130%; }

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

Note: the scrollbar thumb hardcoded hex values (`#27272a`, `#3f3f46`) are intentionally kept as-is. CSS custom properties don't work inside pseudo-element `background` in all browsers when the var is a raw RGB channel.

- [ ] **Step 2: Verify CSS file is valid**

```bash
npx --yes css-validator app/globals.css 2>&1 || true
```

Alternatively: open the dev server and check the browser console for any CSS parse errors.

- [ ] **Step 3: Commit**

```bash
git add app/globals.css
git commit -m "feat: add design token CSS custom properties to globals.css"
```

---

## Task 2: Migrate tailwind.config.ts to var() references

**Files:**
- Modify: `tailwind.config.ts`

- [ ] **Step 1: Replace the entire tailwind.config.ts**

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
      fontSize: {
        // Unitless line-heights so spacing scales with html font-size (large/medium/small modes).
        // Tailwind's defaults use absolute rem line-heights which don't scale.
        '2xs': ['0.625rem', { lineHeight: '1.5' }],
        'xs':  ['0.75rem',  { lineHeight: '1.5' }],
        'sm':  ['0.875rem', { lineHeight: '1.5' }],
        'base':['1rem',     { lineHeight: '1.5' }],
        'lg':  ['1.125rem', { lineHeight: '1.5' }],
        'xl':  ['1.25rem',  { lineHeight: '1.4' }],
        '2xl': ['1.5rem',   { lineHeight: '1.35' }],
      },
      colors: {
        'surface-base':    'rgb(var(--color-surface-base)    / <alpha-value>)',
        'surface-card':    'rgb(var(--color-surface-card)    / <alpha-value>)',
        'surface-raised':  'rgb(var(--color-surface-raised)  / <alpha-value>)',
        'surface-overlay': 'rgb(var(--color-surface-overlay) / <alpha-value>)',
        'border-subtle':   'rgb(var(--color-border-subtle)   / <alpha-value>)',
        'border-default':  'rgb(var(--color-border-default)  / <alpha-value>)',
        'border-strong':   'rgb(var(--color-border-strong)   / <alpha-value>)',
        'text-primary':    'rgb(var(--color-text-primary)    / <alpha-value>)',
        'text-secondary':  'rgb(var(--color-text-secondary)  / <alpha-value>)',
        'text-muted':      'rgb(var(--color-text-muted)      / <alpha-value>)',
        'accent':          'rgb(var(--color-accent)          / <alpha-value>)',
        'accent-light':    'rgb(var(--color-accent-light)    / <alpha-value>)',
        'accent-subtle':   'rgb(var(--color-accent-subtle)   / <alpha-value>)',
        'error':           'rgb(var(--color-error)           / <alpha-value>)',
        'success':         'rgb(var(--color-success)         / <alpha-value>)',
        'warning':         'rgb(var(--color-warning)         / <alpha-value>)',
      },
      // Semantic radius aliases — use in Wave 3 className migration
      borderRadius: {
        'card':  'var(--radius-lg)',
        'modal': 'var(--radius-2xl)',
        'badge': 'var(--radius-full)',
      },
      // Semantic shadow aliases — use in Wave 3 className migration
      boxShadow: {
        'card':  'var(--shadow-card)',
        'modal': 'var(--shadow-modal)',
      },
      // Override default font stacks with CSS var — takes effect immediately on font-sans / font-mono classes
      fontFamily: {
        sans: ['var(--font-sans)'],
        mono: ['var(--font-mono)'],
      },
    },
  },
  plugins: [],
}

export default config
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors. If you see "Cannot find module" or type errors in tailwind.config.ts, check that `tailwindcss` types are installed.

- [ ] **Step 3: Verify existing Tailwind classes still resolve**

Start the dev server and open the dashboard:

```bash
npm run dev
```

Navigate to the main page. Visually confirm:
- Cards still have dark backgrounds
- Text is still readable (zinc colors still applying via Tailwind built-ins)
- `bg-zinc-*`, `text-zinc-*`, `border-zinc-*` classes are unaffected (we only changed `extend.colors`, not the core palette)

- [ ] **Step 4: Commit**

```bash
git add tailwind.config.ts
git commit -m "feat: migrate tailwind.config.ts colors to CSS var() references"
```

---

## Task 3: Create lib/tokens.ts

**Files:**
- Create: `lib/tokens.ts`

- [ ] **Step 1: Create the file**

```typescript
// lib/tokens.ts
// SSR-safe typed constants for JS consumers (Recharts, inline styles).
// Source of truth is app/globals.css :root — keep values in sync manually.
// Values here must exactly match the CSS vars in globals.css.

export const FIT_THRESHOLDS = {
  green: 80,
  amber: 60,
} as const

export const SURFACE_COLORS = {
  base:    '#09090b',
  card:    '#18181b',
  raised:  '#27272a',
  overlay: '#3f3f46',
} as const

export const BORDER_COLORS = {
  subtle:  '#1c1c1f',
  default: '#3f3f46',
  strong:  '#52525b',
} as const

export const TEXT_COLORS = {
  primary:   '#fafafa',
  secondary: '#a1a1aa',
  muted:     '#52525b',
} as const

export const SEMANTIC_COLORS = {
  accent:       '#6366f1',
  accentLight:  '#818cf8',
  accentSubtle: '#1e1b4b',
  error:        '#f87171',
  success:      '#4ade80',
  warning:      '#fbbf24',
} as const

export const CHART_COLORS = {
  scraped:     '#6366f1',
  proceed:     '#818cf8',
  resumeBuilt: '#3b82f6',
  applied:     '#fbbf24',
  interviewed: '#fb923c',
  offer:       '#4ade80',
  rejected:    '#f87171',
  visaKill:    '#f43f5e',
  pending:     '#71717a',
  other:       '#52525b',
} as const

export const FONT = {
  sans: 'system-ui, -apple-system, sans-serif',
  mono: 'ui-monospace, SFMono-Regular, monospace',
} as const

export const RADIUS = {
  sm:   '0.25rem',
  md:   '0.375rem',
  lg:   '0.5rem',
  xl:   '0.75rem',
  '2xl': '1rem',
  full: '9999px',
} as const

export const SHADOW = {
  sm:    '0 1px 2px rgb(0 0 0 / 0.5)',
  card:  '0 20px 25px -5px rgb(0 0 0 / 0.5), 0 8px 10px -6px rgb(0 0 0 / 0.5)',
  modal: '0 25px 50px -12px rgb(0 0 0 / 0.7)',
} as const
```

Note: `FIT_THRESHOLDS` is moved here from `lib/constants.ts`. In Task 3 step 3 we update the one import that references it.

- [ ] **Step 2: Update the FIT_THRESHOLDS import site**

Find all files importing from `lib/constants.ts`:

```bash
grep -r "from.*lib/constants" /Users/vietquocbui/repos/ResumeLoop --include="*.ts" --include="*.tsx" -l
```

For each file found, change:
```typescript
import { FIT_THRESHOLDS } from '@/lib/constants'
```
to:
```typescript
import { FIT_THRESHOLDS } from '@/lib/tokens'
```

Then delete `lib/constants.ts` since all its exports are now in `lib/tokens.ts`.

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors. If you see "Module not found: lib/constants", you missed an import site in step 2.

- [ ] **Step 4: Commit**

```bash
git add lib/tokens.ts
git rm lib/constants.ts
git commit -m "feat: create lib/tokens.ts with typed design token exports"
```

---

## Task 4: Migrate PipelineSankeyChart.tsx

**Files:**
- Modify: `components/PipelineSankeyChart.tsx`

Six change sites in this file. No logic changes — only constant references.

- [ ] **Step 1: Add import**

At the top of the file, after the existing imports:

```typescript
import { CHART_COLORS, SURFACE_COLORS, BORDER_COLORS, SEMANTIC_COLORS } from '@/lib/tokens'
```

- [ ] **Step 2: Replace NODE_COLORS (lines 16–28)**

Replace:
```typescript
const NODE_COLORS: Record<string, string> = {
  Scraped:        '#6366f1',
  'Visa Kill':    '#f43f5e',
  Proceed:        '#818cf8',
  Pending:        '#71717a',
  'Resume Built': '#3b82f6',
  Other:          '#52525b',
  Applied:        '#fbbf24',
  Interviewed:    '#fb923c',
  'No Response':  '#52525b',
  Rejected:       '#f87171',
  Offer:          '#4ade80',
}
```

With:
```typescript
const NODE_COLORS: Record<string, string> = {
  Scraped:        CHART_COLORS.scraped,
  'Visa Kill':    CHART_COLORS.visaKill,
  Proceed:        CHART_COLORS.proceed,
  Pending:        CHART_COLORS.pending,
  'Resume Built': CHART_COLORS.resumeBuilt,
  Other:          CHART_COLORS.other,
  Applied:        CHART_COLORS.applied,
  Interviewed:    CHART_COLORS.interviewed,
  'No Response':  CHART_COLORS.other,
  Rejected:       CHART_COLORS.rejected,
  Offer:          CHART_COLORS.offer,
}
```

- [ ] **Step 3: Replace fallback color (line 93)**

Replace:
```typescript
const color = NODE_COLORS[name] ?? '#6366f1'
```

With:
```typescript
const color = NODE_COLORS[name] ?? CHART_COLORS.scraped
```

- [ ] **Step 4: Replace SankeyTooltip inline styles (lines 118–120)**

Replace:
```typescript
<div style={{ background: '#18181b', border: '1px solid #3f3f46', borderRadius: 6, padding: '6px 10px', fontSize: 14, color: '#e4e4e7' }}>
  {d.source?.name} → {d.target?.name}
  <span style={{ marginLeft: 8, color: '#818cf8', fontFamily: 'monospace' }}>{d.value}</span>
```

With:
```typescript
<div style={{ background: SURFACE_COLORS.card, border: `1px solid ${BORDER_COLORS.default}`, borderRadius: 6, padding: '6px 10px', fontSize: 14, color: '#e4e4e7' }}>
  {d.source?.name} → {d.target?.name}
  <span style={{ marginLeft: 8, color: SEMANTIC_COLORS.accentLight, fontFamily: 'monospace' }}>{d.value}</span>
```

- [ ] **Step 5: Replace html2canvas backgroundColor (line 129)**

Replace:
```typescript
const canvas = await html2canvas(el, { backgroundColor: '#18181b', scale: 2, useCORS: true })
```

With:
```typescript
const canvas = await html2canvas(el, { backgroundColor: SURFACE_COLORS.card, scale: 2, useCORS: true })
```

- [ ] **Step 6: Replace Sankey link prop (line 206)**

Replace:
```typescript
link={{ stroke: '#3f3f46', fill: '#3f3f46', fillOpacity: 0.5 }}
```

With:
```typescript
link={{ stroke: BORDER_COLORS.default, fill: BORDER_COLORS.default, fillOpacity: 0.5 }}
```

- [ ] **Step 7: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add components/PipelineSankeyChart.tsx
git commit -m "feat: migrate PipelineSankeyChart to lib/tokens.ts constants"
```

---

## Task 5: Migrate FitDistChart.tsx and RoleTrackChart.tsx

**Files:**
- Modify: `components/FitDistChart.tsx`
- Modify: `components/RoleTrackChart.tsx`

**Note on FitDistChart bar fill:** `fill="#22c55e"` (green-500) is intentionally left as-is. It does not match any defined token (`SEMANTIC_COLORS.success` is `#4ade80` / green-400) — changing it would be a visual regression, not a refactor.

- [ ] **Step 1: Update FitDistChart.tsx**

Replace the entire file content:

```typescript
'use client'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { TEXT_COLORS, SURFACE_COLORS, BORDER_COLORS } from '@/lib/tokens'

export function FitDistChart({ data }: { data: Record<string, number> }) {
  const chartData = Object.entries(data).map(([bucket, count]) => ({ bucket, count }))

  return (
    <div className="bg-zinc-900 rounded-lg p-4 border border-zinc-700">
      <h2 className="text-sm font-semibold text-zinc-400 mb-3">Fit% Distribution</h2>
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={chartData}>
          <XAxis dataKey="bucket" tick={{ fill: TEXT_COLORS.secondary, fontSize: 13 }} />
          <YAxis tick={{ fill: TEXT_COLORS.secondary, fontSize: 13 }} />
          <Tooltip contentStyle={{ background: SURFACE_COLORS.card, border: `1px solid ${BORDER_COLORS.default}`, color: '#fff' }} />
          <Bar dataKey="count" fill="#22c55e" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
```

- [ ] **Step 2: Update RoleTrackChart.tsx**

Replace the entire file content:

```typescript
'use client'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { TEXT_COLORS, SURFACE_COLORS, BORDER_COLORS, CHART_COLORS } from '@/lib/tokens'

export function RoleTrackChart({ data }: { data: Record<string, number> }) {
  const chartData = Object.entries(data)
    .map(([track, count]) => ({ track, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 15)

  return (
    <div className="bg-zinc-900 rounded-lg p-4 border border-zinc-700">
      <h2 className="text-sm font-semibold text-zinc-400 mb-3">Role-Track Distribution</h2>
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={chartData} margin={{ bottom: 60 }}>
          <XAxis dataKey="track" tick={{ fill: TEXT_COLORS.secondary, fontSize: 12 }} angle={-35} textAnchor="end" interval={0} />
          <YAxis tick={{ fill: TEXT_COLORS.secondary, fontSize: 13 }} />
          <Tooltip contentStyle={{ background: SURFACE_COLORS.card, border: `1px solid ${BORDER_COLORS.default}`, color: '#fff' }} />
          <Bar dataKey="count" fill={CHART_COLORS.scraped} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
```

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add components/FitDistChart.tsx components/RoleTrackChart.tsx
git commit -m "feat: migrate FitDistChart and RoleTrackChart to lib/tokens.ts constants"
```

---

## Task 6: Final verification

- [ ] **Step 1: Full type-check**

```bash
npx tsc --noEmit
```

Expected: clean output, zero errors.

- [ ] **Step 2: Verify dev server starts**

```bash
npm run dev
```

Expected: server starts on `localhost:3000` with no CSS or JS errors in the terminal or browser console.

- [ ] **Step 3: Visual smoke test**

Open the dashboard (`/dashboard` route). Confirm:
- Pipeline Sankey chart renders with correct stage colors
- Fit% Distribution chart renders (green bars, dark tooltip)
- Role-Track Distribution chart renders (indigo bars, dark tooltip)
- Axis labels are legible (zinc secondary color)
- No white flash or unstyled content

- [ ] **Step 4: Confirm sync contract in place**

```bash
grep -c "SURFACE_COLORS\|CHART_COLORS\|TEXT_COLORS\|BORDER_COLORS\|SEMANTIC_COLORS" components/PipelineSankeyChart.tsx components/FitDistChart.tsx components/RoleTrackChart.tsx
```

Expected: at least 1 match per file (confirms migration happened).

```bash
grep -c "#18181b\|#3f3f46\|#a1a1aa\|#6366f1\|#818cf8\|#f43f5e\|#71717a\|#3b82f6\|#fbbf24\|#fb923c\|#f87171\|#4ade80\|#52525b" components/PipelineSankeyChart.tsx components/FitDistChart.tsx components/RoleTrackChart.tsx
```

Expected: 0 matches across all three files (all migrated tokens removed).

---

## Sync Contract (reminder)

When any token value needs to change:
1. Update the CSS var in `app/globals.css`
2. Update the matching export in `lib/tokens.ts`
3. No other file changes needed

# Design Tokens & Constants Config — Design Spec
_2026-05-23_

## Goal

Extract all repeated hardcoded visual constants (colors, typography, border radius, shadows) from scattered component files into a single source of truth: CSS custom properties in `globals.css`, bridged to Tailwind via `tailwind.config.ts` and to runtime JS via `lib/tokens.ts`.

## Scope

**In scope:**
- Define full design token taxonomy in `globals.css` `:root`
- Migrate `tailwind.config.ts` hardcoded hex values to `var()` references
- Add radius, shadow, and font token categories to `tailwind.config.ts`
- Create/expand `lib/tokens.ts` with typed exports for JS consumers
- Migrate chart components (`PipelineSankeyChart`, `FitDistChart`, `RoleTrackChart`) to import from `lib/tokens.ts`

**Out of scope (future pass):**
- Migrating component Tailwind classnames from utility shorthands (`bg-zinc-900`) to semantic token names (`bg-surface-card`) — this is a Wave 3 task

---

## Architecture

```
app/globals.css (:root)
  └── defines all raw values as CSS custom properties
        │
        ├── tailwind.config.ts
        │     └── extend.colors   → rgb(var(--color-*) / <alpha-value>)
        │         extend.borderRadius → var(--radius-*)
        │         extend.boxShadow   → var(--shadow-*)
        │         extend.fontFamily  → var(--font-*)
        │
        └── lib/tokens.ts
              └── typed JS constants (manually synced, same raw values)
                    └── consumed by chart components (Recharts hex props)
```

### Why two files instead of one

`getComputedStyle` reads CSS vars at runtime — but Next.js renders components server-side where no DOM exists. SSR would throw or return empty strings. `lib/tokens.ts` is a static JS module that works in any render context. Manual sync cost is low: the token set is small and changes infrequently.

---

## Token Taxonomy

### Colors — Surface (bare RGB channels for Tailwind opacity modifier support)

| Token | Value | Usage |
|---|---|---|
| `--color-surface-base` | `9 9 11` | Page background |
| `--color-surface-card` | `24 24 27` | Card/panel backgrounds |
| `--color-surface-raised` | `39 39 42` | Inputs, overlays, scrollbar thumb |
| `--color-surface-overlay` | `63 63 70` | Hover state, scrollbar hover |

### Colors — Border

| Token | Value | Usage |
|---|---|---|
| `--color-border-subtle` | `28 28 31` | Faint dividers |
| `--color-border-default` | `63 63 70` | Standard borders (zinc-700) |
| `--color-border-strong` | `82 82 91` | Emphasis borders (zinc-600) |

### Colors — Text

| Token | Value | Usage |
|---|---|---|
| `--color-text-primary` | `250 250 250` | Main readable text |
| `--color-text-secondary` | `161 161 170` | Labels, chart axis ticks |
| `--color-text-muted` | `82 82 91` | De-emphasized text |

### Colors — Semantic (accent + states)

| Token | Value | Usage |
|---|---|---|
| `--color-accent` | `99 102 241` | Primary CTA, active states (indigo-500) |
| `--color-accent-light` | `129 140 248` | Hover/highlight (indigo-400) |
| `--color-accent-subtle` | `30 27 75` | Tinted backgrounds (indigo-950) |
| `--color-error` | `248 113 113` | Error states (red-400) |
| `--color-success` | `74 222 128` | Success states (green-400) |
| `--color-warning` | `251 191 36` | Warning states (amber-400) |

### Colors — Chart Palette (full hex, Recharts-compatible)

These are defined as full hex in `globals.css` (not bare RGB) because they are only consumed by `lib/tokens.ts` → Recharts — never by Tailwind opacity modifiers.

| Token | Hex | Pipeline stage |
|---|---|---|
| `--color-chart-scraped` | `#6366f1` | Scraped / default |
| `--color-chart-proceed` | `#818cf8` | Proceed |
| `--color-chart-resume-built` | `#3b82f6` | Resume Built |
| `--color-chart-applied` | `#fbbf24` | Applied |
| `--color-chart-interviewed` | `#fb923c` | Interviewed |
| `--color-chart-offer` | `#4ade80` | Offer |
| `--color-chart-rejected` | `#f87171` | Rejected |
| `--color-chart-visa-kill` | `#f43f5e` | Visa Kill |
| `--color-chart-pending` | `#71717a` | Pending |
| `--color-chart-other` | `#52525b` | Other / No Response |

### Typography

| Token | Value |
|---|---|
| `--font-sans` | `system-ui, -apple-system, sans-serif` |
| `--font-mono` | `ui-monospace, SFMono-Regular, monospace` |

### Border Radius

| Token | Value | Tailwind equivalent |
|---|---|---|
| `--radius-sm` | `0.25rem` | `rounded` |
| `--radius-md` | `0.375rem` | `rounded-md` |
| `--radius-lg` | `0.5rem` | `rounded-lg` |
| `--radius-xl` | `0.75rem` | `rounded-xl` |
| `--radius-2xl` | `1rem` | `rounded-2xl` |
| `--radius-full` | `9999px` | `rounded-full` |

### Shadows

| Token | Value | Usage |
|---|---|---|
| `--shadow-sm` | `0 1px 2px rgb(0 0 0 / 0.5)` | Subtle elevation |
| `--shadow-card` | `0 20px 25px -5px rgb(0 0 0 / 0.5), 0 8px 10px -6px rgb(0 0 0 / 0.5)` | Card elevation (shadow-xl) |
| `--shadow-modal` | `0 25px 50px -12px rgb(0 0 0 / 0.7)` | Modal/overlay (shadow-2xl + black/70) |

---

## File Changes

### `app/globals.css`
Add a `/* === Design Tokens === */` block at the top of `:root`, before any other declarations. Existing scrollbar and `--font-scale` declarations remain. Chart hex values go in a clearly-labeled subsection.

### `tailwind.config.ts`
Replace existing hardcoded color hex values under `extend.colors` with `rgb(var(--color-*) / <alpha-value>)` format. Add new extend categories:
- `borderRadius` — maps semantic names to `var(--radius-*)` 
- `boxShadow` — maps semantic names to `var(--shadow-*)`
- `fontFamily` — maps `sans`/`mono` to `var(--font-*)`

Keep the existing custom `fontSize` definitions unchanged (already well-structured).

### `lib/tokens.ts`
Export typed constant objects. Existing `FIT_THRESHOLDS` stays. New exports:

```ts
export const SURFACE_COLORS = { base, card, raised, overlay }  // full hex strings
export const TEXT_COLORS    = { primary, secondary, muted }
export const SEMANTIC_COLORS = { accent, accentLight, accentSubtle, error, success, warning }
export const CHART_COLORS   = { scraped, proceed, resumeBuilt, applied, ... }
export const FONT           = { sans, mono }
export const RADIUS         = { sm, md, lg, xl, '2xl', full }
export const SHADOW         = { sm, card, modal }
```

### Chart components
- `PipelineSankeyChart.tsx` — `NODE_COLORS` object keys replaced with `CHART_COLORS.*` imports
- `FitDistChart.tsx` — inline hex fills (`#18181b`, `#3f3f46`, `#6366f1`, `#a1a1aa`) replaced with `SURFACE_COLORS.*` / `CHART_COLORS.*`
- `RoleTrackChart.tsx` — same pattern as FitDistChart

**No logic changes in any of these files — only the constant values change.**

---

## Sync Contract

When a token value needs to change:
1. Update the CSS var value in `globals.css`
2. Update the matching export in `lib/tokens.ts`
3. No component changes needed

The two files are the only files to touch for any visual constant change.

---

## Non-Goals

- Dark/light mode switching (app is dark-only)
- CSS-in-JS or runtime theme switching
- Component className migration (`bg-zinc-900` → `bg-surface-base`) — future pass

---

## Future Passes (for planning continuity)

Notes for save-session / clear-context pickup. Each pass is independent — can be scoped, grilled, and planned separately.

### Pass 1 — This spec (Wave 2, current)
Define token system. Migrate chart components to `lib/tokens.ts`. No component classname changes.
**Entry point for next session:** `docs/superpowers/specs/2026-05-23-constants-config-design.md`

### Pass 2 — Semantic className migration (Wave 3, future)
Replace all scattered Tailwind utility classes in components with semantic token names:
- `bg-zinc-900` → `bg-surface-base`
- `bg-zinc-800` → `bg-surface-card`
- `text-zinc-400` → `text-text-secondary`
- `border-zinc-700` → `border-border-default`
- `text-indigo-400` → `text-accent-light`
- etc.

**Scope estimate:** ~20 component files. `OutreachPanel.tsx`, `JobDetailModal.tsx`, `ChatDiff.tsx`, `GithubIngest.tsx` are the heaviest. High token density → high value for readability.
**Prerequisite:** Pass 1 merged and tokens confirmed stable.
**Research questions before planning:**
- Which components have the highest token density? (Run grep count per file)
- Are there any classname patterns that can't be expressed with the current token taxonomy? (e.g. hover state variants like `hover:bg-zinc-700`)
- Should hover/focus/active state variants get their own tokens (`--color-surface-raised-hover`) or use opacity modifiers (`bg-surface-raised/80`)?

### Pass 3 — Token audit + expansion (future)
After Pass 2 lands, audit for any remaining hardcoded values missed in Passes 1–2. Candidate areas:
- Animation/transition durations (`duration-150`, `duration-200`) — possibly worth `--duration-fast`, `--duration-base`
- Z-index scale (modal stacking, tooltip layers) — `--z-modal`, `--z-tooltip`, `--z-overlay`
- Max-width constraints on modal/panel widths if hardcoded inline
**Trigger:** Run a grep for any remaining bare hex or `zinc-*`/`indigo-*` classes after Pass 2.

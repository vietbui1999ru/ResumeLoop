# Mobile Responsive Layout & Touch Support

**Date**: 2026-05-23
**Issue**: #20
**Status**: Approved — ready for implementation

---

## Overview

ResumeLoop is currently desktop-only. All mobile UAs are redirected to `/not-supported` via middleware. This spec defines the full mobile-responsive layout and touch support implementation.

**Breakpoint split**: `lg:` (1024px). Desktop (`lg:` and above) unchanged. Mobile (below `lg:`) gets an alternate nav, card-based job list, and bottom-sheet modal.

---

## 1. Architecture & Breakpoint Strategy

### Viewport fix
Replace `h-screen overflow-hidden` on root layout with responsive equivalent:
- Desktop (`lg:`): keep `lg:h-screen lg:overflow-hidden`
- Mobile: `min-h-screen` with `h-dvh` (dynamic viewport height) for iOS address-bar fix

```tsx
// app/(app)/layout.tsx
<div className="min-h-screen lg:h-screen flex flex-col lg:overflow-hidden">
```

Add `h-dvh` to Tailwind config if not available (Tailwind 3.3+ includes it natively).

### Root layout structure (mobile)
```
<div min-h-screen flex flex-col>
  <DemoBanner />                         ← always visible
  <MobileHeader />                       ← max-lg:flex lg:hidden — hamburger + logo
  <div flex flex-1 overflow-hidden>
    <Sidebar />                          ← hidden max-lg:hidden lg:flex
    <MobileDrawer />                     ← max-lg only, overlay on top
    <TourOverlay />
    <OnboardingGate>
      <PageTransition>{children}</PageTransition>
    </OnboardingGate>
  </div>
</div>
```

---

## 2. Navigation — Hamburger + Slide-out Drawer

### MobileHeader (new component)
- Visibility: `flex lg:hidden` (hidden on desktop)
- Fixed to top: `fixed top-0 left-0 right-0 z-30 h-12`
- Content: hamburger button (left) + "RA" logo + current page title (center)
- Safe area: `pt-[env(safe-area-inset-top)]`

```tsx
// components/MobileHeader.tsx
export function MobileHeader({ onMenuOpen }: { onMenuOpen: () => void }) {
  const pathname = usePathname()
  return (
    <header className="flex lg:hidden fixed top-0 left-0 right-0 z-30 h-12
                       bg-surface-card border-b border-zinc-800
                       items-center px-4 gap-3
                       pt-[env(safe-area-inset-top)]">
      <button
        onClick={onMenuOpen}
        aria-label="Open menu"
        className="w-10 h-10 flex items-center justify-center
                   text-text-muted hover:text-text-secondary rounded-lg
                   hover:bg-surface-raised transition-colors"
      >
        <Menu size={20} strokeWidth={1.75} />
      </button>
      <div className="w-6 h-6 rounded-md bg-indigo-600 flex items-center justify-center shrink-0">
        <span className="text-2xs font-bold text-white">RA</span>
      </div>
      <span className="text-sm font-medium text-text-primary">
        {PAGE_LABELS[pathname] ?? 'ResumeAnalyzer'}
      </span>
    </header>
  )
}
```

### MobileDrawer (new component)
- `fixed inset-y-0 left-0 w-64 z-50 bg-surface-card`
- Slide in via framer-motion: `initial={{ x: '-100%' }}` → `animate={{ x: 0 }}`
- Backdrop: `fixed inset-0 bg-black/50 z-40` — clicking closes drawer
- Contains all nav items from Sidebar (Jobs, Chat, Dashboard, Config, Settings, Account, Feedback, Donate, Tour help)
- Tour beacon (pulsing dot) appears on the Tour help item inside the drawer
- Close button (×) at top-right of drawer
- `pb-[env(safe-area-inset-bottom)]` for iOS gesture bar

### Root layout integration
- Extract a `ShellClient` client component (`components/ShellClient.tsx`) to hold `drawerOpen` state — the current `app/(app)/layout.tsx` is an async server component and cannot hold state directly
- `ShellClient` renders: `<MobileHeader onMenuOpen={...} />`, `<MobileDrawer open={...} onClose={...} />`, and `{children}`
- Server layout passes `children` to `ShellClient` and keeps its async DB/auth logic unchanged
- `MobileHeader` receives `onMenuOpen` from `ShellClient`
- `MobileDrawer` receives `open` + `onClose` from `ShellClient`

### Tour overlay on mobile
When `window.innerWidth < 1024`, `TourOverlay` falls back to a centered card (fixed to screen center) rather than anchor-positioned bubbles. This avoids bubbles pointing into the closed drawer.

---

## 3. Jobs Page — Card List + Collapsible Filters

### JobCard (new component: `components/JobCard.tsx`)
Layout per card:
- Row 1: `[checkbox]  [company name]  [fit badge]`
- Row 2: `[role title]  [track badge]`
- Row 3: `[action dropdown]  [clipped date]  [resume status]`

Touch targets:
- Entire card is tappable → opens `JobDetailModal`
- Checkbox wrapper: `w-8 h-8` for adequate tap target; stopPropagation from card click
- Action dropdown: `h-10` on mobile
- Tag dots wrapped in `w-8 h-8` container

```tsx
// components/JobCard.tsx
export function JobCard({ job, selected, onSelect, onOpen, onActionChange }: JobCardProps) {
  return (
    <div
      className={`bg-surface-card border rounded-lg p-4 cursor-pointer
                  transition-colors duration-100 active:bg-surface-raised
                  ${selected ? 'border-indigo-500 bg-indigo-500/5' : 'border-zinc-800'}
                  ${job.hidden ? 'opacity-40' : ''}`}
      onClick={onOpen}
    >
      <div className="flex items-start gap-3 mb-1.5">
        <div
          className="w-8 h-8 flex items-center justify-center shrink-0 -ml-1"
          onClick={e => { e.stopPropagation(); onSelect() }}
        >
          <AnimatedCheckbox checked={selected} onChange={onSelect} label={`Select ${job.company}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {job.visa_status === 'kill' && (
              <span className="text-red-500 text-2xs">⊘</span>
            )}
            <span className="text-sm font-medium text-zinc-200">{job.company}</span>
            <FitBadge pct={job.fit_pct} />
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-xs text-zinc-400 truncate">{job.role_title}</span>
            {job.role_track && (
              <span className="text-2xs px-1.5 py-0.5 bg-zinc-800 border border-zinc-700/80
                               text-zinc-500 rounded font-mono leading-none shrink-0">
                {job.role_track}
              </span>
            )}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-3 ml-7 mt-1" onClick={e => e.stopPropagation()}>
        <select
          value={job.action ?? '0-Saved'}
          onChange={e => onActionChange(e.target.value)}
          className={`h-9 bg-zinc-800 border border-zinc-700 rounded px-2 text-xs
                      ${ACTION_COLORS[job.action ?? '0-Saved'] ?? 'text-zinc-400'}`}
          // ACTION_COLORS is defined in jobs/page.tsx — extract to lib/actions.ts or pass as prop
        >
          {VALID_ACTIONS.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
        <span className={`text-xs font-mono ${clipColor(job.clipped_at ?? job.file_mtime)}`}>
          {fmtDate(job.clipped_at ?? job.file_mtime)}
        </span>
        {job.has_output && <span className="text-green-400 text-xs">✓</span>}
      </div>
    </div>
  )
}
```

### Conditional table vs. card list in jobs/page.tsx
```tsx
const isDesktop = useMediaQuery('(min-width: 1024px)')

// Render area
{isDesktop ? (
  <div className="px-6 pt-4 pb-6">
    <table className="w-full text-sm">...</table>   {/* unchanged */}
  </div>
) : (
  <div className="px-4 pt-3 pb-6 space-y-2">
    {visible.map(job => <JobCard key={job.id} job={job} ... />)}
  </div>
)}
```

### Mobile sticky header (jobs page)
```
Row 1: "Jobs" h1 + count span + [Paste btn] [Scan btn]
Row 2: search input full-width
Row 3: [Filters (N active) ▾] — expand toggle button
--- expanded panel (conditional) ---
  track select (full-width)
  tag select (full-width)
  visa radio group (All / Proceed / Kill)
  date input
  show-hidden checkbox
  [Clear filters] button
```
Active filter count shown as badge on Filters button.

### Bottom drawer positioning
```tsx
<div className={`fixed z-20 bg-surface-card border-t border-zinc-800
                 bottom-0 left-0 right-0 px-4 py-3
                 lg:left-12
                 shadow-xl shadow-black/40`}>
```
Removes the `left-12` hardcode on mobile; keeps it on desktop for sidebar offset.

---

## 4. JobDetailModal — Bottom Sheet with Tabs

### Desktop: unchanged
Existing `DndContext` horizontal layout with drag-reorder stays on desktop.

### Mobile: bottom sheet via framer-motion
```tsx
const isDesktop = useMediaQuery('(min-width: 1024px)')
const [activePanel, setActivePanel] = useState<PanelId>('jd')

const PANELS: { id: PanelId; label: string }[] = [
  { id: 'jd',        label: 'JD' },
  { id: 'pdf',       label: 'PDF' },
  { id: 'reasoning', label: 'Reasoning' },
  { id: 'cover',     label: 'Cover' },
  { id: 'outreach',  label: 'Outreach' },
  { id: 'case',      label: 'Case' },
]

if (!isDesktop) {
  return createPortal(
    <AnimatePresence>
      {/* Backdrop */}
      <motion.div
        className="fixed inset-0 bg-black/60 z-40"
        onClick={onClose}
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      />
      {/* Sheet */}
      <motion.div
        className="fixed bottom-0 left-0 right-0 z-50 bg-surface-card
                   rounded-t-2xl flex flex-col h-[90dvh]"
        onClick={e => e.stopPropagation()}
        initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 28, stiffness: 300 }}
      >
        {/* Drag indicator */}
        <div className="flex justify-center pt-2 pb-1 shrink-0">
          <div className="w-10 h-1 rounded-full bg-zinc-600" />
        </div>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3
                        border-b border-zinc-800 shrink-0">
          <div>
            <p className="text-sm font-semibold text-zinc-100">{job.company}</p>
            <p className="text-xs text-zinc-400">{job.role_title}</p>
          </div>
          <button onClick={onClose}
                  className="w-9 h-9 flex items-center justify-center
                             text-text-muted hover:text-text-secondary rounded-lg">
            <X size={16} />
          </button>
        </div>
        {/* Scrollable tab bar */}
        <div className="flex overflow-x-auto border-b border-zinc-800 shrink-0
                        bg-surface-card [scrollbar-width:none]">
          {PANELS.map(({ id, label }) => (
            <button
              key={id}
              onClick={() => setActivePanel(id)}
              className={`px-4 py-2.5 text-xs font-medium whitespace-nowrap
                          border-b-2 transition-colors duration-100 shrink-0 ${
                activePanel === id
                  ? 'border-indigo-500 text-indigo-400'
                  : 'border-transparent text-text-muted hover:text-text-secondary'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        {/* Panel content */}
        <div className="flex-1 overflow-y-auto pb-[env(safe-area-inset-bottom)]">
          <AnimatePresence mode="wait">
            <motion.div
              key={activePanel}
              initial={{ opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -8 }}
              transition={{ duration: 0.1 }}
              className="h-full"
            >
              {renderMobilePanel(activePanel)}
            </motion.div>
          </AnimatePresence>
        </div>
      </motion.div>
    </AnimatePresence>,
    document.body
  )
}
// else: existing desktop DnD layout
```

`DndContext` wrapped only in the desktop branch — not present on mobile.

---

## 5. System Changes

### middleware.ts
Delete:
- `MOBILE_UA_RE` constant
- `isMobile()` function
- The `if (isMobile(ua)) { return NextResponse.redirect(...) }` block

### /app/not-supported/
Delete entire directory (page no longer needed).

### Touch targets
| Element | Current size | Mobile fix |
|---|---|---|
| Tag dots | `w-2.5 h-2.5` (10px) | Wrap in `w-8 h-8` tappable container |
| Fit badge | `py-0.5` (~16px tall) | `max-lg:py-1` |
| Filter buttons | `py-1.5` (~32px) | `max-lg:h-10` |
| Action dropdown | `py-0.5` (~28px) | `max-lg:h-9` |
| MobileDrawer nav rows | new | `py-2.5` per row = 44px+ |
| Bottom sheet close btn | new | `w-9 h-9` = 36px (acceptable in context) |

### iOS Safari fixes
**Viewport meta** (`app/layout.tsx` — verify or add):
```html
<meta name="viewport"
  content="width=device-width, initial-scale=1, maximum-scale=5, user-scalable=yes, viewport-fit=cover" />
```

**Touch action** (`app/globals.css`):
```css
button, a, input, select, textarea {
  touch-action: manipulation;
}
```

**Safe area insets** applied to:
- `MobileHeader`: `pt-[env(safe-area-inset-top)]`
- `MobileDrawer`: `pb-[env(safe-area-inset-bottom)]`
- Bottom sheet content: `pb-[env(safe-area-inset-bottom)]`

### Settings page — iOS folder picker warning
In cloud mode on iOS Safari (detect via `typeof window !== 'undefined' && /iP(hone|ad|od)/.test(navigator.userAgent)`), show:
> "📱 File picker isn't supported on iOS Safari. Use **Paste JD** to add jobs, or open in Chrome/Edge for folder sync."

---

## 6. Shared Utilities

### hooks/useMediaQuery.ts (create if not present)
```ts
import { useState, useEffect } from 'react'

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false)
  useEffect(() => {
    const mql = window.matchMedia(query)
    setMatches(mql.matches)
    const handler = (e: MediaQueryListEvent) => setMatches(e.matches)
    mql.addEventListener('change', handler)
    return () => mql.removeEventListener('change', handler)
  }, [query])
  return matches
}
```

Initializes to `false` (SSR-safe). Desktop-only UI flashes briefly on hydration on mobile — acceptable for an authenticated app.

---

## 7. Files to Create / Modify / Delete

### Create
- `components/MobileHeader.tsx`
- `components/MobileDrawer.tsx`
- `components/JobCard.tsx`
- `hooks/useMediaQuery.ts`

### Modify
- `middleware.ts` — remove `isMobile` block
- `app/(app)/layout.tsx` — `ShellClient` wrapper, `MobileHeader` + `MobileDrawer`, fix root classnames
- `app/(app)/jobs/page.tsx` — `JobCard` conditional render, mobile header, collapsible filters, drawer fix
- `components/JobDetailModal.tsx` — mobile bottom sheet + tabs, DnD desktop-only
- `components/TourOverlay.tsx` — centered fallback on mobile (`window.innerWidth < 1024`)
- `app/(app)/settings/page.tsx` — iOS folder picker warning
- `app/layout.tsx` — verify `viewport-fit=cover`
- `app/globals.css` — `touch-action: manipulation`

### Delete
- `app/not-supported/page.tsx`

---

## 8. Implementation Phases

### Phase 1 — Unblock (middleware + shell)
1. Remove mobile redirect from `middleware.ts`
2. Delete `app/not-supported/page.tsx`
3. Add `viewport-fit=cover`, `touch-action: manipulation`, root classname fix
4. Create `MobileHeader` + `MobileDrawer`
5. Update `app/(app)/layout.tsx` with `ShellClient` + conditional nav

### Phase 2 — Jobs page
6. Create `hooks/useMediaQuery.ts`
7. Create `components/JobCard.tsx`
8. Conditional table vs. card list in `jobs/page.tsx`
9. Mobile sticky header + collapsible filters
10. Fix bottom drawer `left-0` on mobile (`lg:left-12`)

### Phase 3 — Modal
11. Mobile bottom sheet + tab switcher in `JobDetailModal.tsx`
12. DnD scoped to desktop branch only
13. `h-[90dvh]` + safe area padding

### Phase 4 — Polish
14. `TourOverlay` centered fallback on mobile
15. Settings iOS warning banner
16. Touch target fixes (tag dots, badges, filter buttons)
17. Test on iOS Safari + Android Chrome

---

## 9. Out of Scope (v1)
- Swipe-to-reveal actions on job cards
- Native app / PWA install prompt
- Cloud storage integrations (Google Drive, Dropbox) for mobile job import
- Landscape mode optimizations for tablet

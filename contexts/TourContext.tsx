'use client'
import {
  createContext, useContext, useState, useEffect,
  useCallback, useMemo, type ReactNode,
} from 'react'
import { useRouter, usePathname } from 'next/navigation'

export interface TourStepDef {
  id:     string
  page:   string
  target: string | null
  title:  string
  body:   string
}

export const TOUR_STEPS: TourStepDef[] = [
  // ── 1. ACCOUNT — fill in identity before anything else ───────────────────────
  {
    id: 'account-profile', page: '/account', target: 'account-personal-info',
    title: 'Start here — your resume identity',
    body: 'Fill in your name, contact, LinkedIn, and work auth. These fields appear in every generated resume. Takes 2 minutes.',
  },

  // ── 2. SETTINGS — configure before operating ─────────────────────────────────
  {
    id: 'settings-ai', page: '/settings', target: 'ai-settings',
    title: 'Connect your AI provider',
    body: 'Add an API key — Anthropic Claude recommended. Required for resume generation and the Chat assistant.',
  },
  {
    id: 'settings-folder', page: '/settings', target: 'jobs-folder',
    title: 'Point to your jobs folder',
    body: 'Choose the folder where your .md job descriptions live. ResumeLoop scans here to import new listings.',
  },
  {
    id: 'settings-clipper-guide', page: '/settings', target: 'clipper-guide-btn',
    title: 'Clip jobs from the web',
    body: 'Set up Obsidian Web Clipper to save job postings as .md files in one click. Optional but speeds up importing.',
  },

  // ── 3. JOBS — import, select, generate ───────────────────────────────────────
  {
    id: 'jobs-paste', page: '/jobs', target: 'paste-jd-btn',
    title: 'Paste a job description',
    body: 'Copy any job posting and paste it here in markdown format — no folder setup needed. Perfect for one-off applications.',
  },
  {
    id: 'jobs-scan', page: '/jobs', target: 'scan-btn',
    title: 'Or bulk-scan your folder',
    body: 'Click Scan to import all .md job files at once. New listings appear in the table below automatically.',
  },
  {
    id: 'jobs-filter', page: '/jobs', target: 'filters-bar',
    title: 'Filter and search',
    body: 'Search by company or role. Narrow by fit score, track, or visa requirements to find today\'s targets.',
  },
  {
    id: 'jobs-table', page: '/jobs', target: 'jobs-table',
    title: 'Select jobs to tailor',
    body: 'Check boxes next to jobs you want a resume for. Multi-select works — batch-generate for all at once.',
  },
  {
    id: 'jobs-generate', page: '/jobs', target: 'generate-btn',
    title: 'Generate tailored resumes',
    body: 'AI reads the JD, picks your best bullets, writes a custom tagline, and produces a 1-page DOCX — one per job.',
  },
  {
    id: 'jobs-action', page: '/jobs', target: 'action-cell',
    title: 'Track your applications',
    body: 'Log each stage — Applied, Interview, Offer. Keeps your pipeline visible and updates your .md file in sync.',
  },

  // ── 4. DASHBOARD — review results once jobs are generated ─────────────────────
  {
    id: 'dash-role-chart', page: '/', target: 'dashboard-role-chart',
    title: 'Pipeline funnel',
    body: 'Sankey chart tracks how jobs move from Saved → Applied → Interview → Offer. Spot drop-off at a glance.',
  },
  {
    id: 'dash-outputs', page: '/', target: 'dashboard-outputs',
    title: 'Download your resumes',
    body: 'Every generated DOCX lives here. Click to preview AI reasoning or download.',
  },

  // ── 5. CHAT — advanced refinement ────────────────────────────────────────────
  {
    id: 'chat-intro', page: '/chat', target: null,
    title: 'Refine with Chat',
    body: 'Ask Claude to swap bullets, emphasize different skills, or tailor your resume to a specific JD in conversation.',
  },
  {
    id: 'chat-github-import', page: '/chat', target: 'chat-github-import',
    title: 'Import projects from GitHub',
    body: 'Paste any repo URL — AI reads the README and writes 3–5 achievement bullets ready to use in your resume.',
  },

  // ── 6. CONFIG — manage bullet libraries and profiles ─────────────────────────
  {
    id: 'config-intro', page: '/config', target: null,
    title: 'Edit your resume profile',
    body: 'Manage bullet libraries, fork profiles for different tracks (GenAI / Systems / Backend), and set the active one.',
  },
]

// localStorage helpers — storage is write-through only; seenIds state is authoritative
const LS  = (id: string) => `tour2_seen_${id}`
const markSeen   = (id: string) => localStorage.setItem(LS(id), '1')
const unmarkSeen = (id: string) => localStorage.removeItem(LS(id))
const readSeenFromLS = (): Set<string> =>
  new Set(TOUR_STEPS.filter(s => !!localStorage.getItem(LS(s.id))).map(s => s.id))

interface TourCtx {
  activeStep:      TourStepDef | null
  pagesWithUnseen: string[]
  advance:         () => void
  skipPage:        () => void
  activateForPage: (page: string) => void
  reset:           () => void
}

const Ctx = createContext<TourCtx | null>(null)

export function useTourContext(): TourCtx {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useTourContext must be inside TourProvider')
  return ctx
}

export function TourProvider({ children }: { children: ReactNode }) {
  // seenIds is the single source of truth; localStorage is write-through
  const [seenIds, setSeenIds]   = useState<Set<string>>(new Set())
  const [hydrated, setHydrated] = useState(false)
  const pathname = usePathname()
  const router   = useRouter()

  // Hydrate from localStorage after mount (localStorage is unavailable on server)
  useEffect(() => {
    setSeenIds(readSeenFromLS())
    setHydrated(true)
  }, [])

  // activeStep: fully derived — no imperative setActiveStep needed
  const activeStep = useMemo<TourStepDef | null>(() => {
    if (!hydrated) return null
    return TOUR_STEPS.find(s => s.page === pathname && !seenIds.has(s.id)) ?? null
  }, [pathname, seenIds, hydrated])

  // Beacon is gated on hydration to prevent flash for returning users
  const pagesWithUnseen = useMemo<string[]>(() => {
    if (!hydrated) return []
    return TOUR_STEPS
      .filter(s => !seenIds.has(s.id))
      .map(s => s.page)
      .filter((p, i, arr) => arr.indexOf(p) === i)
  }, [seenIds, hydrated])

  const advance = useCallback(() => {
    if (!activeStep) return
    markSeen(activeStep.id)
    setSeenIds(prev => new Set(prev).add(activeStep.id))
  }, [activeStep])

  const skipPage = useCallback(() => {
    if (!activeStep) return
    const remaining = TOUR_STEPS.filter(s => s.page === activeStep.page && !seenIds.has(s.id))
    remaining.forEach(s => markSeen(s.id))
    setSeenIds(prev => {
      const next = new Set(prev)
      remaining.forEach(s => next.add(s.id))
      return next
    })
  }, [activeStep, seenIds])

  const activateForPage = useCallback((page: string) => {
    router.push(page)
    // If navigating to the same page (e.g. from SetupPanel), the pathname won't
    // change, but the useMemo will already show the correct first unseen step.
  }, [router])

  const reset = useCallback(() => {
    TOUR_STEPS.forEach(s => unmarkSeen(s.id))
    setSeenIds(new Set())
    // Navigate to the first tour page so the tour starts from the beginning
    if (pathname !== TOUR_STEPS[0].page) {
      router.push(TOUR_STEPS[0].page)
    }
    // If already on the first tour page, useMemo recomputes seenIds → shows first step
  }, [pathname, router])

  return (
    <Ctx.Provider value={{ activeStep, pagesWithUnseen, advance, skipPage, activateForPage, reset }}>
      {children}
    </Ctx.Provider>
  )
}

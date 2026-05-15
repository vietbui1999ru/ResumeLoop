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
  // Dashboard
  {
    id: 'dash-overview', page: '/', target: null,
    title: 'Dashboard',
    body: 'Your analytics hub. Track applications, see fit scores across roles, and review generated resumes.',
  },
  {
    id: 'dash-role-chart', page: '/', target: 'dashboard-role-chart',
    title: 'Role breakdown',
    body: "Donut chart shows how many jobs fall into each role track you're targeting. Role tracks come from your Config.",
  },
  {
    id: 'dash-outputs', page: '/', target: 'dashboard-outputs',
    title: 'Resume history',
    body: 'Every generated resume appears here. Click to view or download as DOCX.',
  },
  // Jobs
  {
    id: 'jobs-intro', page: '/jobs', target: null,
    title: 'Jobs — your pipeline',
    body: 'All job descriptions in your configured folder appear here. Scan to import new ones, then select and generate.',
  },
  {
    id: 'jobs-scan', page: '/jobs', target: 'scan-btn',
    title: 'Scan for new jobs',
    body: 'Click Scan to import job descriptions from your configured folder. New jobs appear in the table below.',
  },
  {
    id: 'jobs-filter', page: '/jobs', target: 'filters-bar',
    title: 'Filter and search',
    body: 'Search by company or role. Filter by fit score, track, or visa requirements.',
  },
  {
    id: 'jobs-table', page: '/jobs', target: 'jobs-table',
    title: 'Select jobs',
    body: 'Check the boxes next to jobs you want to tailor your resume for. Multi-select is supported.',
  },
  {
    id: 'jobs-generate', page: '/jobs', target: 'generate-btn',
    title: 'Generate resumes',
    body: 'After selecting jobs, click Generate Resume. Each job gets its own AI-tailored DOCX.',
  },
  {
    id: 'jobs-action', page: '/jobs', target: 'action-cell',
    title: 'Track your stage',
    body: 'Update the stage per job — Applied, Interview, Offer. Writes back to your markdown file instantly.',
  },
  // Settings
  {
    id: 'settings-folder', page: '/settings', target: 'jobs-folder',
    title: 'Jobs folder',
    body: 'Point this at the folder containing your .md job description files. ResumeLoop scans here for new jobs.',
  },
  {
    id: 'settings-ai', page: '/settings', target: 'ai-settings',
    title: 'AI provider',
    body: 'Choose your AI provider and model. Anthropic Claude is required for Chat; other providers work for generation.',
  },
  // Chat
  {
    id: 'chat-intro', page: '/chat', target: null,
    title: 'Chat',
    body: 'Refine your resume with Claude. Ask it to emphasize skills, swap bullets, or tailor to a specific JD.',
  },
  // Config
  {
    id: 'config-intro', page: '/config', target: null,
    title: 'Profile editor',
    body: 'Edit your base resume as JSON. Fork profiles for different role tracks — GenAI, Systems, Backend. The active profile is used for every generation.',
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

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

const FUNNEL_PAGES = ['/settings', '/account', '/chat', '/jobs', '/', '/config']

export const TOUR_STEPS: TourStepDef[] = [
  // /settings — 2 steps
  {
    id: 'settings-ai', page: '/settings', target: 'ai-settings',
    title: 'Required: connect your AI provider',
    body: 'Add an API key to enable resume generation. Anthropic Claude recommended. Keys are AES-256 encrypted at rest.',
  },
  {
    id: 'settings-firecrawl', page: '/settings', target: 'firecrawl-settings',
    title: 'Firecrawl key — optional',
    body: 'Enables web scraping for job details. Skip this for now — you can always add it later in Settings.',
  },

  // /account — 1 step
  {
    id: 'account-contact', page: '/account', target: 'contact-form',
    title: 'Your resume header',
    body: 'Fill in name, email, phone, location, and LinkedIn. These populate the top of every generated resume.',
  },

  // /chat — 2 steps
  {
    id: 'chat-github-import', page: '/chat', target: 'chat-github-import',
    title: 'Import from GitHub first',
    body: 'Pull your repos in one click — then we use them as raw material for your resume bullets.',
  },
  {
    id: 'chat-grill', page: '/chat', target: null,
    title: 'Tell us about your work',
    body: 'The AI will ask about your roles, what you built, and outcomes. Say "skip" or "done" anytime to exit.',
  },

  // /jobs — 3 steps
  {
    id: 'jobs-paste', page: '/jobs', target: 'paste-jd-btn',
    title: 'Start here — paste any job posting',
    body: 'Copy any job listing and paste it here. No folder setup needed.',
  },
  {
    id: 'jobs-generate', page: '/jobs', target: 'generate-btn',
    title: 'Generate tailored resumes',
    body: 'AI reads the JD, picks your best bullets, writes a custom tagline, and produces a 1-page DOCX.',
  },
  {
    id: 'jobs-card', page: '/jobs', target: null,
    title: 'Click any job card',
    body: 'See your resume PDF, AI fit analysis, and cover letter draft. Track application status here.',
  },

  // / (Dashboard) — 2 steps
  {
    id: 'dashboard-pipeline', page: '/', target: null,
    title: 'Your pipeline at a glance',
    body: 'See how many jobs are at each stage — Applied, Interview, Offer. Sankey chart updates live.',
  },
  {
    id: 'dashboard-export', page: '/', target: null,
    title: 'Export your pipeline chart',
    body: 'Download your Sankey chart as an image for sharing or portfolio.',
  },

  // /config — 2 steps
  {
    id: 'config-cards', page: '/config', target: null,
    title: 'Drag to reorder your profile',
    body: 'Toggle experience and projects on/off, or drag to reorder. Changes apply to all future resumes.',
  },
  {
    id: 'config-json', page: '/config', target: null,
    title: 'Advanced: JSON editor',
    body: 'Edit your full profile JSON directly in the "JSON" tab. Changes show a diff before saving.',
  },
]

// localStorage helpers — storage is write-through only; seenIds state is authoritative
const LS  = (id: string) => `tour2_seen_${id}`
const markSeen   = (id: string) => localStorage.setItem(LS(id), '1')
const unmarkSeen = (id: string) => localStorage.removeItem(LS(id))
const readSeenFromLS = (): Set<string> =>
  new Set(TOUR_STEPS.filter(s => !!localStorage.getItem(LS(s.id))).map(s => s.id))

interface TourCtx {
  activeStep:       TourStepDef | null
  pagesWithUnseen:  string[]
  history:          string[]
  advance:          () => void
  back:             () => void
  skipToNextPage:   () => void
  skipStep:         () => void
  activateForPage:  (page: string) => void
  restartPageTour:  (page: string) => void
  reset:            () => void
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
  const [history, setHistory]   = useState<string[]>([])
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
    setHistory(prev => [...prev, activeStep.id])
    markSeen(activeStep.id)
    setSeenIds(prev => new Set(prev).add(activeStep.id))
  }, [activeStep])

  const back = useCallback(() => {
    setHistory(prev => {
      if (!prev.length) return prev
      const next = [...prev]
      const lastId = next.pop()!
      unmarkSeen(lastId)
      setSeenIds(s => {
        const n = new Set(s)
        n.delete(lastId)
        return n
      })
      return next
    })
  }, [])

  const skipStep = useCallback(() => {
    if (!activeStep) return
    markSeen(activeStep.id)
    setSeenIds(prev => new Set(prev).add(activeStep.id))
  }, [activeStep])

  const skipToNextPage = useCallback(() => {
    if (!activeStep) return
    const remaining = TOUR_STEPS.filter(s => s.page === activeStep.page && !seenIds.has(s.id))
    remaining.forEach(s => markSeen(s.id))
    setSeenIds(prev => {
      const next = new Set(prev)
      remaining.forEach(s => next.add(s.id))
      return next
    })
    // Navigate to next funnel page
    const idx = FUNNEL_PAGES.indexOf(activeStep.page)
    const nextPage = FUNNEL_PAGES[idx + 1]
    if (nextPage) router.push(nextPage)
  }, [activeStep, seenIds, router])

  const activateForPage = useCallback((page: string) => {
    router.push(page)
  }, [router])

  const restartPageTour = useCallback((page: string) => {
    const pageSteps = TOUR_STEPS.filter(s => s.page === page)
    pageSteps.forEach(s => unmarkSeen(s.id))
    setSeenIds(prev => {
      const next = new Set(prev)
      pageSteps.forEach(s => next.delete(s.id))
      return next
    })
    router.push(page)
  }, [router])

  const reset = useCallback(() => {
    TOUR_STEPS.forEach(s => unmarkSeen(s.id))
    setSeenIds(new Set())
    setHistory([])
    if (pathname !== FUNNEL_PAGES[0]) {
      router.push(FUNNEL_PAGES[0])
    }
  }, [pathname, router])

  return (
    <Ctx.Provider value={{ activeStep, pagesWithUnseen, history, advance, back, skipToNextPage, skipStep, activateForPage, restartPageTour, reset }}>
      {children}
    </Ctx.Provider>
  )
}

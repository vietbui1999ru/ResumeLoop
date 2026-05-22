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
  // ── 1. SETTINGS — only hard block before generating ───────────────────────
  {
    id: 'settings-ai', page: '/settings', target: 'ai-settings',
    title: 'Required: connect your AI provider',
    body: 'Add an API key to enable resume generation and the Chat assistant. Anthropic Claude recommended. Keys are AES-256 encrypted at rest.',
  },

  // ── 2. JOBS — core workflow ───────────────────────────────────────────────
  {
    id: 'jobs-paste', page: '/jobs', target: 'paste-jd-btn',
    title: 'Start here — paste any job posting',
    body: 'Copy any job listing and paste it here. No folder or Web Clipper setup needed — best for generating your first resume.',
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
    id: 'jobs-scan', page: '/jobs', target: 'scan-btn',
    title: 'Power path: bulk-scan your folder',
    body: 'Import all .md job files at once. Requires the Web Clipper template — click "How to clip jobs →" above to set it up first.',
  },
  {
    id: 'jobs-action', page: '/jobs', target: 'action-cell',
    title: 'Track your applications',
    body: 'Log each stage — Applied, Interview, Offer. Keeps your pipeline visible and updates your .md file in sync.',
  },

  // ── 3. CHAT — refinement ──────────────────────────────────────────────────
  {
    id: 'chat-intro', page: '/chat', target: null,
    title: 'Refine with Chat',
    body: 'Ask Claude to swap bullets, emphasize different skills, or tailor your resume to a specific JD in conversation.',
  },
  {
    id: 'chat-bullets-toggle', page: '/chat', target: 'chat-bullets-toggle',
    title: 'Live bullets panel',
    body: 'Your current resume bullets — live alongside the chat. Switch tabs to see Rendered, Markdown, or raw JSON. Edit JSON directly and save.',
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

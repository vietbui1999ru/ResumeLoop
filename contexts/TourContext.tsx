'use client'
import {
  createContext, useContext, useState, useEffect,
  useCallback, useRef, type ReactNode,
} from 'react'
import { useRouter, usePathname } from 'next/navigation'

export type TourStep =
  | 'welcome'
  | 'folder-check'
  | 'settings-folder'
  | 'scan'
  | 'filter'
  | 'generate'

interface TourCtx {
  active:            boolean
  step:              TourStep
  advance:           () => Promise<void>
  skip:              () => void
  reset:             () => void
  beginAfterSetup:   () => void
  setupStepActive:   boolean
}

const Ctx = createContext<TourCtx | null>(null)

export function useTourContext(): TourCtx {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useTourContext must be inside TourProvider')
  return ctx
}

// Pages each step must be on (undefined = any page)
const STEP_PAGE: Partial<Record<TourStep, string>> = {
  'folder-check':    '/jobs',
  'settings-folder': '/settings',
  'scan':    '/jobs',
  'filter':  '/jobs',
  'generate': '/jobs',
}

function markHintsComplete() {
  // Dismiss individual TourBubble hints once the full tour is done
  ;['scan', 'generate', 'action'].forEach(k => localStorage.setItem(`tour_${k}`, '1'))
}

export function TourProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState(false)
  const [step, setStep]     = useState<TourStep>('welcome')
  const router   = useRouter()
  const pathname = usePathname()
  // Keep a ref to pathname so advance() can read it without stale closure issues
  const pathnameRef = useRef(pathname)
  useEffect(() => { pathnameRef.current = pathname }, [pathname])

  // Initialize from localStorage
  useEffect(() => {
    if (localStorage.getItem('tour_completed') === '1') return
    const saved = localStorage.getItem('tour_step') as TourStep | null
    setStep(saved ?? 'welcome')
    setActive(true)
  }, [])

  // Auto-navigate to the correct page when step changes
  useEffect(() => {
    if (!active) return
    const target = STEP_PAGE[step]
    if (target && pathnameRef.current !== target) router.push(target)
  }, [active, step]) // eslint-disable-line react-hooks/exhaustive-deps

  // When the user navigates back to /jobs while on settings-folder step,
  // resolve whether folder is configured and advance accordingly
  useEffect(() => {
    if (!active || step !== 'settings-folder' || pathname !== '/jobs') return
    fetch('/api/settings').then(r => r.json()).then((d: Record<string, unknown>) => {
      save(d.jobs_path_exists ? 'scan' : 'folder-check')
    })
  }, [pathname]) // eslint-disable-line react-hooks/exhaustive-deps

  function save(s: TourStep) {
    setStep(s)
    localStorage.setItem('tour_step', s)
  }

  function complete() {
    localStorage.setItem('tour_completed', '1')
    localStorage.removeItem('tour_step')
    markHintsComplete()
    setActive(false)
  }

  const skip = useCallback(complete, []) // eslint-disable-line react-hooks/exhaustive-deps

  const advance = useCallback(async () => {
    if (step === 'welcome') {
      const d = await fetch('/api/settings').then(r => r.json()) as Record<string, unknown>
      if (!d.jobs_path_exists) {
        save('folder-check')
      } else {
        save('scan')
      }
    } else if (step === 'folder-check') {
      save('settings-folder')
      router.push('/settings')
    } else if (step === 'settings-folder') {
      save('scan')
      router.push('/jobs')
    } else if (step === 'scan') {
      save('filter')
    } else if (step === 'filter') {
      save('generate')
    } else if (step === 'generate') {
      complete()
    }
  }, [step, router]) // eslint-disable-line react-hooks/exhaustive-deps

  const reset = useCallback(() => {
    localStorage.removeItem('tour_completed')
    localStorage.removeItem('tour_step')
    ;['scan', 'generate', 'action'].forEach(k => localStorage.removeItem(`tour_${k}`))
    setStep('welcome')
    setActive(true)
    if (pathnameRef.current !== '/jobs') router.push('/jobs')
  }, [router])

  const beginAfterSetup = useCallback(() => {
    localStorage.removeItem('tour_step')
    localStorage.setItem('tour_step', 'scan')
    setStep('scan')
    setActive(true)
  }, [])

  const SETUP_STEPS: TourStep[] = ['welcome', 'folder-check', 'settings-folder']
  const setupStepActive = active && SETUP_STEPS.includes(step)

  return (
    <Ctx.Provider value={{ active, step, advance, skip, reset, beginAfterSetup, setupStepActive }}>
      {children}
    </Ctx.Provider>
  )
}

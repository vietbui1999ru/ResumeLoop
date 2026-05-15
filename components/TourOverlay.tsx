'use client'
import { useEffect, useRef, useState, useCallback } from 'react'
import { useTourContext, TOUR_STEPS, type TourStepDef } from '@/contexts/TourContext'

interface Rect { top: number; left: number; width: number; height: number }

const PAD = 8

function useTargetRect(target: string | null, active: boolean): Rect | null {
  const [rect, setRect] = useState<Rect | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const find = useCallback(() => {
    if (!target || !active) { setRect(null); return }
    let tries = 0
    const attempt = () => {
      const el = document.querySelector(`[data-tour="${target}"]`)
      if (el) {
        const r = el.getBoundingClientRect()
        setRect({ top: r.top, left: r.left, width: r.width, height: r.height })
      } else if (tries++ < 15) {
        timerRef.current = setTimeout(attempt, 150)
      } else {
        setRect(null)
      }
    }
    attempt()
  }, [target, active])

  useEffect(() => {
    find()
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [find])

  useEffect(() => {
    if (!rect || !target) return
    const update = () => {
      const el = document.querySelector(`[data-tour="${target}"]`)
      if (el) {
        const r = el.getBoundingClientRect()
        setRect({ top: r.top, left: r.left, width: r.width, height: r.height })
      }
    }
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
    }
  }, [rect, target])

  return rect
}

// 4-rect spotlight — cuts a hole in the overlay to highlight a target element
function Spotlight({ rect }: { rect: Rect }) {
  const vw = typeof window !== 'undefined' ? window.innerWidth  : 1920
  const vh = typeof window !== 'undefined' ? window.innerHeight : 1080
  const t = rect.top    - PAD
  const l = rect.left   - PAD
  const r = rect.left   + rect.width  + PAD
  const b = rect.top    + rect.height + PAD
  const base = 'fixed pointer-events-none bg-black/65 z-[68]'
  return (
    <>
      <div className={base} style={{ top: 0,    left: 0, right: 0, height: Math.max(0, t) }} />
      <div className={base} style={{ top: b,    left: 0, right: 0, bottom: 0, height: Math.max(0, vh - b) }} />
      <div className={base} style={{ top: t,    left: 0, width: Math.max(0, l), height: b - t }} />
      <div className={base} style={{ top: t,    left: r, right: 0, width: Math.max(0, vw - r), height: b - t }} />
    </>
  )
}

// Bubble is w-80 = 320px; guarantee 16px margin on both sides
const BUBBLE_W = 320
const BUBBLE_MARGIN = 16

function bubbleStyle(rect: Rect | null): React.CSSProperties {
  if (!rect) {
    return { position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }
  }
  const estimatedBubbleH = 180
  const vw = window.innerWidth
  const vh = window.innerHeight
  const below = rect.top + rect.height + PAD + 12
  const above = rect.top - PAD - 12 - estimatedBubbleH
  const l = Math.max(BUBBLE_MARGIN, Math.min(rect.left, vw - BUBBLE_W - BUBBLE_MARGIN))

  let top: number
  if (below + estimatedBubbleH <= vh) {
    top = below
  } else if (above >= BUBBLE_MARGIN) {
    top = above
  } else {
    // Target fills viewport — center bubble vertically
    top = Math.max(BUBBLE_MARGIN, (vh - estimatedBubbleH) / 2)
  }

  return { position: 'fixed', top, left: l }
}

function PageProgress({ step }: { step: TourStepDef }) {
  const pageSteps = TOUR_STEPS.filter(s => s.page === step.page)
  const idx = pageSteps.findIndex(s => s.id === step.id)
  return (
    <div className="flex items-center gap-1.5 mb-3">
      {pageSteps.map((s, i) => (
        <div
          key={s.id}
          className={`h-1.5 rounded-full transition-all duration-150 ${
            i < idx   ? 'w-3 bg-indigo-600'
            : i === idx ? 'w-4 bg-indigo-400'
            : 'w-1.5 bg-zinc-700'
          }`}
        />
      ))}
      <span className="ml-1 text-[10px] text-zinc-500">{idx + 1} / {pageSteps.length}</span>
    </div>
  )
}

export function TourOverlay() {
  const { activeStep, advance, skipPage } = useTourContext()
  const rect    = useTargetRect(activeStep?.target ?? null, !!activeStep)
  const nextRef = useRef<HTMLButtonElement>(null)

  // Keyboard: Escape → skip page, Enter/→ → advance
  useEffect(() => {
    if (!activeStep) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape')                      skipPage()
      if (e.key === 'Enter' || e.key === 'ArrowRight') advance()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [activeStep, advance, skipPage])

  // Move focus into bubble so keyboard users can interact
  useEffect(() => {
    if (activeStep) nextRef.current?.focus()
  }, [activeStep])

  if (!activeStep) return null

  const pageSteps = TOUR_STEPS.filter(s => s.page === activeStep.page)
  const isLast = pageSteps[pageSteps.length - 1]?.id === activeStep.id

  return (
    <>
      {/* Full-screen click blocker — prevents interacting with content behind overlay */}
      <div className="fixed inset-0 z-[65] bg-black/65" aria-hidden="true" />

      {/* Spotlight visual holes (rendered above blocker, pointer-events-none) */}
      {rect && <Spotlight rect={rect} />}

      {/* Bubble — above everything, acts as dialog for a11y */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Tour: ${activeStep.title}`}
        className="fixed z-[80] w-80 bg-indigo-950 border border-indigo-600/60 rounded-xl p-4 shadow-2xl shadow-black/60"
        style={bubbleStyle(rect)}
      >
        <PageProgress step={activeStep} />

        <p className="text-sm font-semibold text-white mb-1">{activeStep.title}</p>
        <p className="text-xs text-zinc-300 leading-relaxed mb-4">{activeStep.body}</p>

        <div className="flex items-center justify-between gap-2">
          <button
            onClick={skipPage}
            className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
            aria-label="Skip tour for this page"
          >
            Skip this page
          </button>
          <button
            ref={nextRef}
            onClick={advance}
            className="text-xs px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-colors font-medium focus:outline-none focus:ring-2 focus:ring-indigo-400"
            aria-label={isLast ? 'Finish tour for this page' : 'Next tour step'}
          >
            {isLast ? 'Done ✓' : 'Next →'}
          </button>
        </div>
      </div>
    </>
  )
}

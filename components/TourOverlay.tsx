'use client'
import { useEffect, useRef, useState, useCallback } from 'react'
import { useTourContext, TOUR_STEPS, type TourStepDef } from '@/contexts/TourContext'

interface Rect { top: number; left: number; width: number; height: number }

const PAD = 10

function useTargetRect(target: string | null, active: boolean): Rect | null {
  const [rect, setRect] = useState<Rect | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const find = useCallback(() => {
    if (!target || !active) { setRect(null); return }
    // On mobile, force null rect to center the bubble
    const isMobile = typeof window !== 'undefined' && window.innerWidth < 1024
    if (isMobile) { setRect(null); return }
    let tries = 0
    const attempt = () => {
      const el = document.querySelector(`[data-tour="${target}"]`)
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
        timerRef.current = setTimeout(() => {
          const r = el.getBoundingClientRect()
          setRect({ top: r.top, left: r.left, width: r.width, height: r.height })
        }, 300)
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

// Glowing pulsing ring drawn exactly over the highlighted component
function HighlightRing({ rect }: { rect: Rect }) {
  return (
    <div
      className="fixed pointer-events-none z-[69] rounded-lg"
      style={{
        top:    rect.top    - PAD,
        left:   rect.left   - PAD,
        width:  rect.width  + PAD * 2,
        height: rect.height + PAD * 2,
        animation: 'tour-highlight-pulse 2s ease-in-out infinite',
      }}
    />
  )
}

// Bubble is w-80 = 320px; guarantee 16px margin on both sides
const BUBBLE_W   = 320
const BUBBLE_H   = 200   // estimated for positioning
const BUBBLE_GAP = 14    // gap between spotlight edge and bubble
const MARGIN     = 16

type BubblePlacement = 'below' | 'above' | 'center'

function getBubblePlacement(rect: Rect | null): { style: React.CSSProperties; placement: BubblePlacement } {
  if (!rect) {
    return { style: { position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }, placement: 'center' }
  }
  const vw  = window.innerWidth
  const vh  = window.innerHeight
  const sTop    = rect.top    - PAD
  const sBottom = rect.top    + rect.height + PAD
  const below   = sBottom + BUBBLE_GAP
  const above   = sTop    - BUBBLE_GAP - BUBBLE_H
  const left    = Math.max(MARGIN, Math.min(rect.left, vw - BUBBLE_W - MARGIN))

  let top: number
  let placement: BubblePlacement
  if (below + BUBBLE_H <= vh - MARGIN) {
    top = below; placement = 'below'
  } else if (above >= MARGIN) {
    top = above; placement = 'above'
  } else {
    top = Math.max(MARGIN, (vh - BUBBLE_H) / 2); placement = 'center'
  }

  return { style: { position: 'fixed', top, left }, placement }
}

// Small arrow connecting the bubble to the spotlight edge
function BubbleArrow({ rect, placement }: { rect: Rect; placement: BubblePlacement }) {
  if (placement === 'center') return null
  const vw   = window.innerWidth
  const left = Math.max(MARGIN, Math.min(rect.left, vw - BUBBLE_W - MARGIN))
  // Arrow center tracks center of highlighted element, clamped within bubble
  const targetCenterX = rect.left + rect.width / 2
  const arrowX = Math.max(12, Math.min(BUBBLE_W - 12, targetCenterX - left))

  const arrowStyle: React.CSSProperties = {
    position: 'absolute',
    left:     arrowX - 6,
    width:    12,
    height:   8,
  }

  if (placement === 'below') {
    return (
      <div className="pointer-events-none absolute" style={{ ...arrowStyle, top: -8 }}>
        <svg viewBox="0 0 12 8" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M6 0L12 8H0L6 0Z" style={{ fill: 'rgb(var(--color-surface-overlay))' }} />
          <path d="M6 1L11 8H1L6 1Z" style={{ stroke: 'rgb(var(--color-border-strong))', fill: 'none' }} strokeWidth="0.5" />
        </svg>
      </div>
    )
  }
  return (
    <div className="pointer-events-none absolute" style={{ ...arrowStyle, bottom: -8 }}>
      <svg viewBox="0 0 12 8" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M6 8L0 0H12L6 8Z" style={{ fill: 'rgb(var(--color-surface-overlay))' }} />
        <path d="M6 7L1 0H11L6 7Z" style={{ stroke: 'rgb(var(--color-border-strong))', fill: 'none' }} strokeWidth="0.5" />
      </svg>
    </div>
  )
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
            i < idx   ? 'w-3 bg-accent'
            : i === idx ? 'w-4 bg-accent-light'
            : 'w-1.5 bg-surface-overlay'
          }`}
        />
      ))}
      <span className="ml-1 text-2xs text-text-muted">{idx + 1} / {pageSteps.length}</span>
    </div>
  )
}

export function TourOverlay() {
  const { activeStep, advance, back, skipToNextPage, skipStep, history, reset } = useTourContext()
  const rect    = useTargetRect(activeStep?.target ?? null, !!activeStep)
  const nextRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!activeStep) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape')                           skipToNextPage()
      if (e.key === 'ArrowLeft')                         back()
      if (e.key === 'Enter' || e.key === 'ArrowRight')  advance()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [activeStep, advance, back, skipToNextPage])

  useEffect(() => {
    if (activeStep) nextRef.current?.focus()
  }, [activeStep])

  if (!activeStep) return null

  const pageSteps   = TOUR_STEPS.filter(s => s.page === activeStep.page)
  const isLast      = pageSteps[pageSteps.length - 1]?.id === activeStep.id
  const isVeryLast  = TOUR_STEPS[TOUR_STEPS.length - 1]?.id === activeStep.id
  const { style: bStyle, placement } = getBubblePlacement(rect)

  return (
    <>
      {/* Highlight ring (only when target element found) */}
      {rect && <HighlightRing rect={rect} />}

      {/* Bubble */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Tour: ${activeStep.title}`}
        className="fixed z-[80] w-80 bg-surface-overlay border border-border-strong rounded-xl p-4 shadow-2xl shadow-black/20"
        style={bStyle}
      >
        {/* Arrow connector (only when target found and not centered) */}
        {rect && <BubbleArrow rect={rect} placement={placement} />}

        <PageProgress step={activeStep} />
        <p className="text-sm font-semibold text-text-primary mb-1">{activeStep.title}</p>
        <p className="text-xs text-text-secondary leading-relaxed mb-4">{activeStep.body}</p>

        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <button
              onClick={back}
              disabled={history.length === 0}
              className="text-xs text-text-muted hover:text-text-secondary disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              aria-label="Go to previous step"
            >
              ← Prev
            </button>
            <button
              onClick={skipStep}
              className="text-xs text-text-muted hover:text-text-secondary transition-colors"
              aria-label="Dismiss this step"
            >
              Later
            </button>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={skipToNextPage}
              className="text-xs text-text-secondary hover:text-text-primary transition-colors"
              aria-label="Skip all steps on this page"
            >
              Skip page
            </button>
            <button
              ref={nextRef}
              onClick={isVeryLast ? reset : advance}
              className="text-xs px-3 py-1.5 bg-accent hover:bg-accent/90 text-white rounded-lg transition-colors font-medium focus:outline-none focus:ring-2 focus:ring-accent/50"
              aria-label={isVeryLast ? 'Restart tour from the beginning' : isLast ? 'Finish tour for this page' : 'Next tour step'}
            >
              {isVeryLast ? 'Restart Tour' : isLast ? 'Done ✓' : 'Next →'}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

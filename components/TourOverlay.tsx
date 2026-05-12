'use client'
import { useEffect, useState, useRef, useCallback } from 'react'
import { useTourContext, type TourStep } from '@/contexts/TourContext'

interface Rect { top: number; left: number; width: number; height: number }

interface StepDef {
  target:    string | null  // data-tour attribute value; null = center modal
  title:     string
  body:      string
  nextLabel: string
  stepNum:   number         // displayed step number (settings-folder shares 2 with folder-check)
}

const TOTAL_STEPS = 5

const STEPS: Record<TourStep, StepDef> = {
  'welcome': {
    target: null,
    title: 'Welcome to ResumeAnalyze',
    body: 'This quick tour walks you through scanning jobs, filtering, and generating tailored resumes. Takes about 2 minutes.',
    nextLabel: 'Get started →',
    stepNum: 1,
  },
  'folder-check': {
    target: null,
    title: 'Set up your Jobs folder',
    body: "Your jobs folder isn't configured yet. Head to Settings to point ResumeAnalyze at your .md job description files.",
    nextLabel: 'Go to Settings →',
    stepNum: 2,
  },
  'settings-folder': {
    target: 'jobs-folder',
    title: 'Pick your Jobs folder',
    body: 'Select the folder containing your .md job description files. ResumeAnalyze will scan this folder for new jobs.',
    nextLabel: 'Done — Return to Jobs →',
    stepNum: 2,
  },
  'scan': {
    target: 'scan-btn',
    title: 'Scan for new jobs',
    body: 'Click Scan to import job descriptions from your folder. New jobs appear in the table below.',
    nextLabel: 'Next →',
    stepNum: 3,
  },
  'filter': {
    target: 'filters-bar',
    title: 'Filter and search jobs',
    body: 'Search by company or role, filter by fit score, track, or visa. Use the Filters toggle for advanced options.',
    nextLabel: 'Next →',
    stepNum: 4,
  },
  'generate': {
    target: 'jobs-table',
    title: 'Generate your resume',
    body: 'Select jobs with the checkboxes, then click Generate Resume in the bar that appears at the bottom.',
    nextLabel: 'Done ✓',
    stepNum: 5,
  },
}

const PAD = 8  // px padding around spotlight target

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
    if (!rect) return
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

function Spotlight({ rect }: { rect: Rect }) {
  const vw = typeof window !== 'undefined' ? window.innerWidth  : 1920
  const vh = typeof window !== 'undefined' ? window.innerHeight : 1080
  const t = rect.top    - PAD
  const l = rect.left   - PAD
  const r = rect.left   + rect.width  + PAD
  const b = rect.top    + rect.height + PAD

  const base = 'fixed pointer-events-none bg-black/65 z-[60]'
  return (
    <>
      {/* top   */} <div className={base} style={{ top: 0, left: 0, right: 0, height: Math.max(0, t) }} />
      {/* bottom*/} <div className={base} style={{ top: b, left: 0, right: 0, bottom: 0, height: Math.max(0, vh - b) }} />
      {/* left  */} <div className={base} style={{ top: t, left: 0, width: Math.max(0, l), height: b - t }} />
      {/* right */} <div className={base} style={{ top: t, left: r, right: 0, width: Math.max(0, vw - r), height: b - t }} />
    </>
  )
}

function BubblePosition(rect: Rect | null): React.CSSProperties {
  if (!rect) {
    return { position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }
  }
  const b = rect.top + rect.height + PAD + 12
  const l = Math.max(16, Math.min(rect.left, window.innerWidth - 340))
  return { position: 'fixed', top: b, left: l }
}

function ProgressDots({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center gap-1.5 mb-3">
      {Array.from({ length: total }, (_, i) => (
        <div
          key={i}
          className={`h-1.5 rounded-full transition-all ${
            i + 1 === current
              ? 'w-4 bg-indigo-400'
              : i + 1 < current
                ? 'w-1.5 bg-indigo-600'
                : 'w-1.5 bg-zinc-700'
          }`}
        />
      ))}
      <span className="ml-1 text-[10px] text-zinc-500">Step {current} / {total}</span>
    </div>
  )
}

export function TourOverlay() {
  const { active, step, advance, skip, setupStepActive } = useTourContext()
  const def  = STEPS[step]
  const rect = useTargetRect(def.target, active)
  const [advancing, setAdvancing] = useState(false)

  const handleAdvance = async () => {
    setAdvancing(true)
    try { await advance() } finally { setAdvancing(false) }
  }

  if (!active || setupStepActive) return null

  return (
    <>
      {/* Backdrop — full viewport when no spotlight target, else 4-rect */}
      {rect
        ? <Spotlight rect={rect} />
        : <div className="fixed inset-0 bg-black/65 z-[60] pointer-events-none" />
      }

      {/* Bubble */}
      <div
        className="z-[70] w-80 bg-indigo-950 border border-indigo-600/60 rounded-xl p-4 shadow-2xl shadow-black/60"
        style={BubblePosition(rect)}
      >
        <ProgressDots current={def.stepNum} total={TOTAL_STEPS} />

        <p className="text-sm font-semibold text-white mb-1">{def.title}</p>
        <p className="text-xs text-zinc-300 leading-relaxed mb-4">{def.body}</p>

        <div className="flex items-center justify-between gap-2">
          <button
            onClick={skip}
            className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            Skip tour
          </button>
          <button
            onClick={handleAdvance}
            disabled={advancing}
            className="text-xs px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 rounded-lg transition-colors font-medium"
          >
            {advancing ? '…' : def.nextLabel}
          </button>
        </div>
      </div>
    </>
  )
}

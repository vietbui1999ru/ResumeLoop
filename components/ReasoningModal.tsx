'use client'
import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { DURATION, EASE } from '@/lib/motion'

interface Output {
  reasoning: string
  tagline: string
  variant: string
  built_at: string
}

interface Props {
  jobId: string
  company: string
  roleTitle: string
  onClose: () => void
}

export default function ReasoningModal({ jobId, company, roleTitle, onClose }: Props) {
  const [output, setOutput] = useState<Output | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const ac = new AbortController()
    fetch(`/api/jobs/${jobId}/output`, { signal: ac.signal })
      .then(r => r.ok ? r.json() as Promise<Output> : Promise.reject(r.status))
      .then(setOutput)
      .catch(e => { if ((e as DOMException)?.name !== 'AbortError') setError('Failed to load reasoning') })
      .finally(() => { if (!ac.signal.aborted) setLoading(false) })
    return () => ac.abort()
  }, [jobId])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const EXPECTED_HEADINGS = new Set(['Track', 'Work Experience', 'Projects', 'Tagline', 'Skills'])

  const sections = output?.reasoning
    ? output.reasoning.split(/\n(?=## )/).map(s => {
        const newlineIdx = s.indexOf('\n')
        const heading = s.slice(0, newlineIdx === -1 ? s.length : newlineIdx).replace(/^##\s*/, '')
        const body = newlineIdx === -1 ? '' : s.slice(newlineIdx + 1).trim()
        return { heading, body }
      }).filter(s => EXPECTED_HEADINGS.has(s.heading))
    : []

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: DURATION.fast, ease: EASE }}
        onClick={onClose}
      >
        <motion.div
          className="relative bg-surface-card border border-border-subtle rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col mx-4"
          initial={{ scale: 0.96, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.96, opacity: 0 }}
          transition={{ duration: DURATION.base, ease: EASE }}
          onClick={e => e.stopPropagation()}
        >
          <div className="flex items-start justify-between p-5 border-b border-border-subtle">
            <div>
              <h2 className="text-base font-semibold text-text-primary">AI Reasoning</h2>
              <p className="text-sm text-text-muted mt-0.5">{company} — {roleTitle}</p>
            </div>
            <button
              onClick={onClose}
              className="ml-4 text-text-muted hover:text-text-primary hover:bg-surface-raised text-lg leading-none rounded-lg p-1 transition-colors duration-100"
            >✕</button>
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
            {loading && <p className="text-text-secondary text-sm">Loading…</p>}
            {error   && <p className="text-red-400 text-sm">{error}</p>}
            {!loading && !error && sections.length === 0 && (
              <p className="text-text-muted text-sm">No reasoning available — generate a resume first.</p>
            )}
            {sections.map(({ heading, body }) => (
              <div key={heading}>
                <h3 className="text-sm font-semibold text-indigo-300 mb-1">{heading}</h3>
                <p className="text-sm text-text-secondary whitespace-pre-wrap leading-relaxed">{body}</p>
              </div>
            ))}
          </div>
        </motion.div>
    </motion.div>
  )
}

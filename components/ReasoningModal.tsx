'use client'
import { useEffect, useState } from 'react'

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
    fetch(`/api/jobs/${jobId}/output`)
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(setOutput)
      .catch(() => setError('Failed to load reasoning'))
      .finally(() => setLoading(false))
  }, [jobId])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const sections = output?.reasoning
    ? output.reasoning.split(/\n(?=## )/).map(s => {
        const newlineIdx = s.indexOf('\n')
        const heading = s.slice(0, newlineIdx === -1 ? s.length : newlineIdx).replace(/^##\s*/, '')
        const body = newlineIdx === -1 ? '' : s.slice(newlineIdx + 1).trim()
        return { heading, body }
      })
    : []

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={onClose}
    >
      <div
        className="relative bg-zinc-900 border border-zinc-700 rounded-lg w-full max-w-2xl max-h-[85vh] flex flex-col mx-4"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between p-5 border-b border-zinc-700">
          <div>
            <h2 className="text-base font-semibold text-zinc-100">AI Reasoning</h2>
            <p className="text-sm text-zinc-400 mt-0.5">{company} — {roleTitle}</p>
          </div>
          <button onClick={onClose} className="ml-4 text-zinc-500 hover:text-zinc-200 text-lg leading-none">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {loading && <p className="text-zinc-400 text-sm">Loading…</p>}
          {error   && <p className="text-red-400 text-sm">{error}</p>}
          {!loading && !error && sections.length === 0 && (
            <p className="text-zinc-500 text-sm">No reasoning available — generate a resume first.</p>
          )}
          {sections.map(({ heading, body }) => (
            <div key={heading}>
              <h3 className="text-sm font-semibold text-indigo-300 mb-1">{heading}</h3>
              <p className="text-sm text-zinc-300 whitespace-pre-wrap leading-relaxed">{body}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

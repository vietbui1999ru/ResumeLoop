'use client'
import { useEffect, useState } from 'react'
import { useJobOutput } from '@/lib/useJobOutput'

interface JobDetail {
  id: string
  company: string
  role_title: string
  role_track: string
  fit_pct: number
  visa_status: string
  tags: string
  action: string | null
  file_mtime: string | null
  scanned_at: string | null
  file_path: string
  raw_content: string
}

interface Props {
  jobId: string
  onClose: () => void
}

const REASONING_HEADINGS = new Set(['Track', 'Work Experience', 'Projects', 'Tagline', 'Skills'])

function parseReasoning(reasoning: string | null | undefined) {
  if (!reasoning) return []
  return reasoning.split(/\n(?=## )/).map(s => {
    const nl = s.indexOf('\n')
    const heading = s.slice(0, nl === -1 ? s.length : nl).replace(/^##\s*/, '')
    const body = nl === -1 ? '' : s.slice(nl + 1).trim()
    return { heading, body }
  }).filter(s => REASONING_HEADINGS.has(s.heading))
}

export default function JobDetailModal({ jobId, onClose }: Props) {
  const [job, setJob] = useState<JobDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const { output, loading: outputLoading } = useJobOutput(jobId)
  const [showPdf, setShowPdf] = useState(false)
  const [showReasoning, setShowReasoning] = useState(false)

  useEffect(() => {
    fetch(`/api/jobs/${jobId}`)
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(setJob)
      .catch(() => setError('Failed to load job'))
      .finally(() => setLoading(false))
  }, [jobId])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const tags: string[] = (() => { try { return JSON.parse(job?.tags || '[]') } catch { return [] } })()

  const fmtDate = (iso: string | null) => {
    if (!iso) return '—'
    const d = new Date(iso)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }

  const activePanels = (showPdf ? 1 : 0) + (showReasoning ? 1 : 0)
  const modalWidth = activePanels === 0 ? 'max-w-2xl' : activePanels === 1 ? 'max-w-4xl' : 'max-w-7xl'

  const reasoningSections = parseReasoning(output?.reasoning)

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={onClose}
    >
      <div
        className={`relative bg-zinc-900 border border-zinc-700 rounded-lg w-full ${modalWidth} max-h-[90vh] flex flex-col mx-4 transition-all duration-150`}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between p-5 border-b border-zinc-700 flex-shrink-0">
          <div>
            {loading
              ? <div className="text-zinc-400 text-sm">Loading…</div>
              : error
                ? <div className="text-red-400 text-sm">{error}</div>
                : <>
                    <h2 className="text-base font-semibold text-zinc-100">{job!.role_title}</h2>
                    <p className="text-sm text-zinc-400 mt-0.5">{job!.company}</p>
                  </>
            }
          </div>
          <button
            onClick={onClose}
            className="ml-4 text-zinc-500 hover:text-zinc-200 text-lg leading-none"
          >
            ✕
          </button>
        </div>

        {job && (
          <div className="flex flex-1 min-h-0">
            {/* Left column — always visible */}
            <div className={`flex flex-col flex-shrink-0 ${activePanels > 0 ? 'w-80 border-r border-zinc-700' : 'flex-1'}`}>
              {/* Structured fields */}
              <div className="px-5 py-4 border-b border-zinc-700 grid grid-cols-2 gap-x-8 gap-y-2 text-sm flex-shrink-0">
                <Field label="Track"   value={job.role_track || '—'} />
                <Field label="Fit"     value={`${job.fit_pct}%`} valueClass={job.fit_pct >= 60 ? 'text-green-400' : 'text-zinc-300'} />
                <Field label="Action"  value={job.action ?? '0-Saved'} />
                <Field label="Visa"    value={job.visa_status} valueClass={job.visa_status === 'kill' ? 'text-red-400' : 'text-green-400'} />
                <Field label="Clipped" value={fmtDate(job.file_mtime)} />
                <Field label="Scanned" value={fmtDate(job.scanned_at)} />
                <div className="col-span-2">
                  <span className="text-zinc-500">Tags </span>
                  {tags.length
                    ? tags.map(t => (
                        <span key={t} className="inline-block mr-1 px-1.5 py-0.5 bg-zinc-800 rounded text-xs text-zinc-300">{t}</span>
                      ))
                    : <span className="text-zinc-500">—</span>
                  }
                </div>
              </div>

              {/* Actions */}
              <div className="px-5 py-3 border-b border-zinc-700 flex-shrink-0">
                <a
                  href={`file://${job.file_path}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm text-indigo-400 hover:text-indigo-300"
                >
                  Open file ↗
                </a>
              </div>

              {/* Resume section */}
              <div className="px-5 py-3 border-b border-zinc-700 flex-shrink-0">
                <p className="text-xs text-zinc-500 mb-2 uppercase tracking-wide">Resume</p>
                {outputLoading ? (
                  <p className="text-xs text-zinc-500">Loading…</p>
                ) : !output ? (
                  <p className="text-xs text-zinc-500">No resume generated yet.</p>
                ) : (
                  <div className="flex gap-3 flex-wrap">
                    <a
                      href={`/api/generate/${jobId}/download`}
                      download
                      className="text-sm text-indigo-400 hover:text-indigo-300"
                    >
                      ↓ DOCX
                    </a>
                    {output.pdf_path ? (
                      <button
                        onClick={() => setShowPdf(v => !v)}
                        className={`text-sm ${showPdf ? 'text-zinc-400 hover:text-zinc-200' : 'text-indigo-400 hover:text-indigo-300'}`}
                      >
                        {showPdf ? 'Hide PDF' : 'Preview PDF'}
                      </button>
                    ) : (
                      <span className="text-sm text-zinc-600" title="PDF not available">Preview PDF</span>
                    )}
                    {reasoningSections.length > 0 && (
                      <button
                        onClick={() => setShowReasoning(v => !v)}
                        className={`text-sm ${showReasoning ? 'text-zinc-400 hover:text-zinc-200' : 'text-yellow-400 hover:text-yellow-300'}`}
                      >
                        {showReasoning ? 'Hide Why AI' : '★ Why AI?'}
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* JD raw content — scrollable */}
              <pre className="flex-1 overflow-y-auto px-5 py-4 text-xs text-zinc-400 whitespace-pre-wrap font-mono leading-relaxed min-h-0">
                {job.raw_content || '(no content)'}
              </pre>
            </div>

            {/* PDF panel */}
            {showPdf && (
              <div className={`flex-1 min-w-0 relative ${showReasoning ? 'border-r border-zinc-700' : ''}`}>
                <iframe
                  src={`/api/jobs/${jobId}/preview`}
                  className="absolute inset-0 w-full h-full"
                  title="Resume PDF preview"
                />
              </div>
            )}

            {/* AI Reasoning panel */}
            {showReasoning && (
              <div className="flex-1 min-w-0 overflow-y-auto px-5 py-4 space-y-4">
                <p className="text-xs text-zinc-500 uppercase tracking-wide">AI Reasoning</p>
                {reasoningSections.length === 0 ? (
                  <p className="text-sm text-zinc-500">No reasoning available.</p>
                ) : reasoningSections.map(({ heading, body }) => (
                  <div key={heading}>
                    <h3 className="text-sm font-semibold text-indigo-300 mb-1">{heading}</h3>
                    <p className="text-sm text-zinc-300 whitespace-pre-wrap leading-relaxed">{body}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function Field({ label, value, valueClass = 'text-zinc-300' }: { label: string; value: string; valueClass?: string }) {
  return (
    <div>
      <span className="text-zinc-500">{label} </span>
      <span className={valueClass}>{value}</span>
    </div>
  )
}

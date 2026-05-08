'use client'
import { useEffect, useState } from 'react'

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

export default function JobDetailModal({ jobId, onClose }: Props) {
  const [job, setJob] = useState<JobDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

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

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={onClose}
    >
      <div
        className="relative bg-zinc-900 border border-zinc-700 rounded-lg w-full max-w-2xl max-h-[85vh] flex flex-col mx-4"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between p-5 border-b border-zinc-700">
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
          <>
            {/* Structured fields */}
            <div className="px-5 py-4 border-b border-zinc-700 grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
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
            <div className="px-5 py-3 border-b border-zinc-700">
              <a
                href={`file://${job.file_path}`}
                target="_blank"
                rel="noreferrer"
                className="text-sm text-indigo-400 hover:text-indigo-300"
              >
                Open file ↗
              </a>
            </div>

            {/* Raw JD body */}
            <pre className="flex-1 overflow-y-auto px-5 py-4 text-xs text-zinc-400 whitespace-pre-wrap font-mono leading-relaxed">
              {job.raw_content || '(no content)'}
            </pre>
          </>
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

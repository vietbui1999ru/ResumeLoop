'use client'
import { useEffect, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  horizontalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useJobOutput } from '@/lib/useJobOutput'
import PdfViewer from './PdfViewer'
import OutreachPanel from './OutreachPanel'

// ── Types ────────────────────────────────────────────────────────────────────

type PanelId = 'jd' | 'pdf' | 'reasoning' | 'cover' | 'outreach'

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
  apply_url: string | null
}

interface Props {
  jobId: string
  onClose: () => void
}


const fmtDate = (iso: string | null) => {
  if (!iso) return '—'
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// ── SortablePanel wrapper ─────────────────────────────────────────────────────

function SortablePanel({ id, children }: { id: PanelId; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id })
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex flex-col min-w-0 flex-1 border-r border-zinc-700 last:border-r-0 ${isDragging ? 'opacity-50 z-10' : ''}`}
    >
      {/* Drag handle strip */}
      <div
        {...attributes}
        {...listeners}
        className="flex items-center justify-center h-5 cursor-grab active:cursor-grabbing bg-zinc-800/50 border-b border-zinc-700 shrink-0 select-none"
        title="Drag to reorder"
      >
        <span className="text-zinc-600 text-xs">⠿</span>
      </div>
      {children}
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function JobDetailModal({ jobId, onClose }: Props) {
  const [job, setJob] = useState<JobDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const { output, loading: outputLoading } = useJobOutput(jobId)

  // Apply URL state (editable, persisted via PATCH)
  const [applyUrl, setApplyUrl] = useState<string | null>(null)
  const [applyUrlSaving, setApplyUrlSaving] = useState(false)

  // Panel state
  const [panelOrder, setPanelOrder] = useState<PanelId[]>(['jd', 'pdf', 'reasoning', 'cover', 'outreach'])
  const [openPanels, setOpenPanels] = useState<Set<PanelId>>(new Set<PanelId>(['jd']))

  // Cover letter state
  const [coverLetter, setCoverLetter] = useState<string | null>(null)
  const [coverLoading, setCoverLoading] = useState(false)
  const [coverError, setCoverError] = useState('')
  const [copied, setCopied] = useState(false)

  // Auto-open reasoning when output loads with reasoning
  useEffect(() => {
    if (!outputLoading && output?.reasoning) {
      setOpenPanels(prev => new Set<PanelId>(Array.from(prev).concat('reasoning')))
    }
  }, [outputLoading, output?.reasoning])

  // Load existing cover letter from output
  useEffect(() => {
    if (!outputLoading && output?.cover_letter) {
      setCoverLetter(output.cover_letter)
    }
  }, [outputLoading, output?.cover_letter])

  // Fetch job details
  useEffect(() => {
    fetch(`/api/jobs/${jobId}`)
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then((j: JobDetail) => { setJob(j); setApplyUrl(j.apply_url) })
      .catch(() => setError('Failed to load job'))
      .finally(() => setLoading(false))
  }, [jobId])

  async function saveApplyUrl(url: string | null) {
    setApplyUrlSaving(true)
    await fetch(`/api/jobs/${jobId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apply_url: url }),
    })
    setApplyUrlSaving(false)
  }

  // Escape to close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  // DnD sensors
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (over && active.id !== over.id) {
      setPanelOrder(prev => {
        const oldIndex = prev.indexOf(active.id as PanelId)
        const newIndex = prev.indexOf(over.id as PanelId)
        return arrayMove(prev, oldIndex, newIndex)
      })
    }
  }

  function togglePanel(id: PanelId) {
    setOpenPanels(prev => {
      const arr = Array.from(prev)
      if (prev.has(id)) return new Set<PanelId>(arr.filter(p => p !== id))
      return new Set<PanelId>(arr.concat(id))
    })
  }

  async function generateCoverLetter() {
    if (!output) {
      setCoverError('Generate a resume first.')
      setOpenPanels(prev => new Set<PanelId>(Array.from(prev).concat('cover')))
      return
    }
    setCoverLoading(true)
    setCoverError('')
    setCoverLetter('')
    setOpenPanels(prev => new Set<PanelId>(Array.from(prev).concat('cover')))

    try {
      const res = await fetch(`/api/jobs/${jobId}/cover-letter`, { method: 'POST' })
      if (!res.ok) { setCoverError('Generation failed.'); setCoverLoading(false); return }
      const reader = res.body!.getReader()
      const decoder = new TextDecoder()
      let text = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        text += decoder.decode(value, { stream: true })
        setCoverLetter(text)
      }
    } catch (e) {
      setCoverError(String(e))
    } finally {
      setCoverLoading(false)
    }
  }

  async function copyToClipboard() {
    if (!coverLetter) return
    await navigator.clipboard.writeText(coverLetter)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const tags: string[] = (() => { try { return JSON.parse(job?.tags || '[]') } catch { return [] } })()
  const visiblePanels = panelOrder.filter(id => openPanels.has(id))
  const panelCount = visiblePanels.length

  // Modal width scales with panel count
  const modalWidth =
    panelCount === 0 ? 'max-w-lg' :
    panelCount === 1 ? 'max-w-2xl' :
    panelCount === 2 ? 'max-w-4xl' :
    panelCount === 3 ? 'max-w-6xl' : 'max-w-[96vw]'

  const PANEL_LABELS: Record<PanelId, string> = {
    jd: 'JD',
    pdf: 'PDF',
    reasoning: 'AI Why',
    cover: 'Cover Letter',
    outreach: 'Outreach',
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={onClose}
    >
      <div
        className={`relative bg-zinc-900 border border-zinc-700 rounded-lg w-full ${modalWidth} max-h-[92vh] flex flex-col mx-4 transition-all duration-150`}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between px-5 pt-4 pb-3 border-b border-zinc-700 shrink-0">
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
          <button onClick={onClose} className="ml-4 text-zinc-500 hover:text-zinc-200 text-lg leading-none">✕</button>
        </div>

        {/* Panel toggle toolbar */}
        <div className="flex items-center gap-1 px-4 py-2 border-b border-zinc-700 shrink-0 bg-zinc-800/40">
          <span className="text-xs text-zinc-500 mr-2">Panels:</span>
          {panelOrder.map(id => (
            <button
              key={id}
              onClick={() => togglePanel(id)}
              className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                openPanels.has(id)
                  ? 'bg-indigo-600 text-white'
                  : 'bg-zinc-700 text-zinc-400 hover:text-white hover:bg-zinc-600'
              }`}
            >
              {PANEL_LABELS[id]}
            </button>
          ))}
        </div>

        {/* Panels area */}
        {panelCount === 0 ? (
          <div className="flex-1 flex items-center justify-center text-zinc-500 text-sm">
            Toggle a panel above to view content.
          </div>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={visiblePanels} strategy={horizontalListSortingStrategy}>
              <div className="flex flex-1 min-h-0 overflow-hidden">
                {visiblePanels.map(id => (
                  <SortablePanel key={id} id={id}>
                    {id === 'jd' && job && (
                      <JdPanel
                        job={job}
                        tags={tags}
                        output={output}
                        outputLoading={outputLoading}
                        onGenCoverLetter={generateCoverLetter}
                        coverLoading={coverLoading}
                        applyUrl={applyUrl}
                        onSaveApplyUrl={saveApplyUrl}
                        applyUrlSaving={applyUrlSaving}
                      />
                    )}
                    {id === 'pdf' && <PdfPanel jobId={jobId} hasPdf={!!output?.pdf_path} />}
                    {id === 'reasoning' && <ReasoningPanel reasoning={output?.reasoning ?? null} loading={outputLoading} />}
                    {id === 'cover' && (
                      <CoverPanel
                        text={coverLetter}
                        loading={coverLoading}
                        error={coverError}
                        onGenerate={generateCoverLetter}
                        onCopy={copyToClipboard}
                        copied={copied}
                        hasOutput={!!output}
                      />
                    )}
                    {id === 'outreach' && <OutreachPanel jobId={jobId} />}
                  </SortablePanel>
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>
    </div>
  )
}

// ── JD Panel ──────────────────────────────────────────────────────────────────

function JdPanel({ job, tags, output, outputLoading, onGenCoverLetter, coverLoading, applyUrl, onSaveApplyUrl, applyUrlSaving }: {
  job: JobDetail
  tags: string[]
  output: ReturnType<typeof useJobOutput>['output']
  outputLoading: boolean
  onGenCoverLetter: () => void
  coverLoading: boolean
  applyUrl: string | null
  onSaveApplyUrl: (url: string | null) => Promise<void>
  applyUrlSaving: boolean
}) {
  const [editingUrl, setEditingUrl] = useState(false)
  const [urlDraft, setUrlDraft] = useState('')

  function startEdit() {
    setUrlDraft(applyUrl ?? '')
    setEditingUrl(true)
  }

  async function commitUrl() {
    await onSaveApplyUrl(urlDraft.trim() || null)
    setEditingUrl(false)
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-y-auto">
      {/* Structured fields */}
      <div className="px-4 py-3 border-b border-zinc-700 grid grid-cols-2 gap-x-6 gap-y-2 text-sm shrink-0">
        <Field label="Track"   value={job.role_track || '—'} />
        <Field label="Fit"     value={`${job.fit_pct}%`} valueClass={job.fit_pct >= 60 ? 'text-green-400' : 'text-zinc-300'} />
        <Field label="Action"  value={job.action ?? '0-Saved'} />
        <Field label="Visa"    value={job.visa_status} valueClass={job.visa_status === 'kill' ? 'text-red-400' : 'text-green-400'} />
        <Field label="Clipped" value={fmtDate(job.file_mtime)} />
        <Field label="Scanned" value={fmtDate(job.scanned_at)} />
        <div className="col-span-2">
          <span className="text-zinc-500">Tags </span>
          {tags.length
            ? tags.map(t => <span key={t} className="inline-block mr-1 px-1.5 py-0.5 bg-zinc-800 rounded text-xs text-zinc-300">{t}</span>)
            : <span className="text-zinc-500">—</span>}
        </div>
        {/* Apply link */}
        <div className="col-span-2">
          <span className="text-zinc-500 text-xs">Apply </span>
          {editingUrl ? (
            <span className="inline-flex items-center gap-1 mt-0.5">
              <input
                autoFocus
                value={urlDraft}
                onChange={e => setUrlDraft(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') void commitUrl(); if (e.key === 'Escape') setEditingUrl(false) }}
                placeholder="https://..."
                className="bg-zinc-800 border border-zinc-600 rounded px-2 py-0.5 text-xs text-zinc-200 focus:outline-none focus:border-indigo-500 w-64"
              />
              <button onClick={() => void commitUrl()} disabled={applyUrlSaving} className="text-xs text-indigo-400 hover:text-indigo-300 disabled:opacity-50">
                {applyUrlSaving ? '…' : 'Save'}
              </button>
              <button onClick={() => setEditingUrl(false)} className="text-xs text-zinc-500 hover:text-zinc-300">Cancel</button>
            </span>
          ) : applyUrl ? (
            <span className="inline-flex items-center gap-2">
              <a href={applyUrl} target="_blank" rel="noreferrer" className="text-xs text-indigo-400 hover:text-indigo-300 underline truncate max-w-xs">
                {applyUrl}
              </a>
              <button onClick={startEdit} className="text-xs text-zinc-600 hover:text-zinc-400">Edit</button>
            </span>
          ) : (
            <button onClick={startEdit} className="text-xs text-zinc-500 hover:text-zinc-300 underline">+ Add apply link</button>
          )}
        </div>
      </div>

      {/* Actions row */}
      <div className="px-4 py-2 border-b border-zinc-700 flex flex-wrap gap-3 items-center shrink-0">
        <a href={`file://${job.file_path}`} target="_blank" rel="noreferrer" className="text-xs text-indigo-400 hover:text-indigo-300">Open file ↗</a>
        {applyUrl && (
          <a href={applyUrl} target="_blank" rel="noreferrer" className="text-xs text-green-400 hover:text-green-300">Apply ↗</a>
        )}
        {!outputLoading && output && (
          <>
            <a href={`/api/generate/${job.id}/download`} download className="text-xs text-indigo-400 hover:text-indigo-300">↓ DOCX</a>
            <button
              onClick={onGenCoverLetter}
              disabled={coverLoading}
              className="text-xs text-yellow-400 hover:text-yellow-300 disabled:opacity-50"
            >
              {coverLoading ? 'Generating…' : '✦ Cover Letter'}
            </button>
          </>
        )}
      </div>

      {/* Resume output metadata */}
      {!outputLoading && output && (
        <div className="px-4 py-3 border-b border-zinc-700 shrink-0">
          <p className="text-xs text-zinc-500 uppercase tracking-wide mb-1.5">Resume Output</p>
          {output.tagline && <p className="text-xs text-zinc-300 italic mb-1">"{output.tagline}"</p>}
          <div className="flex flex-wrap gap-x-3 text-xs text-zinc-500">
            {output.variant && <span>Track: <span className="text-zinc-400">{output.variant}</span></span>}
            {output.built_at && <span>Built: <span className="text-zinc-400">{fmtDate(output.built_at)}</span></span>}
          </div>
        </div>
      )}

      {/* Markdown JD content — no prose plugin, plain styling */}
      <div className="flex-1 px-4 py-3 overflow-y-auto text-sm text-zinc-300 leading-relaxed [&_h1]:text-zinc-100 [&_h1]:font-semibold [&_h1]:text-base [&_h1]:mt-3 [&_h1]:mb-1 [&_h2]:text-zinc-200 [&_h2]:font-semibold [&_h2]:text-sm [&_h2]:mt-3 [&_h2]:mb-1 [&_h3]:text-zinc-200 [&_h3]:font-medium [&_h3]:mt-2 [&_h3]:mb-0.5 [&_ul]:list-disc [&_ul]:pl-4 [&_ul]:space-y-0.5 [&_ol]:list-decimal [&_ol]:pl-4 [&_ol]:space-y-0.5 [&_strong]:text-zinc-100 [&_a]:text-indigo-400 [&_a:hover]:text-indigo-300 [&_p]:mb-2 [&_hr]:border-zinc-700 [&_hr]:my-3">
        <ReactMarkdown>{job.raw_content || '(no content)'}</ReactMarkdown>
      </div>
    </div>
  )
}

// ── PDF Panel ─────────────────────────────────────────────────────────────────

function PdfPanel({ jobId, hasPdf }: { jobId: string; hasPdf: boolean }) {
  if (!hasPdf) {
    return (
      <div className="flex-1 flex items-center justify-center text-zinc-500 text-sm px-4 text-center">
        No PDF available. Generate a resume first.
      </div>
    )
  }
  return (
    <div className="flex-1 relative min-h-0">
      <PdfViewer url={`/api/jobs/${jobId}/preview`} />
    </div>
  )
}

// ── Reasoning Panel ───────────────────────────────────────────────────────────

function ReasoningPanel({ reasoning, loading }: { reasoning: string | null; loading: boolean }) {
  if (loading) return <div className="flex-1 flex items-center justify-center text-zinc-500 text-sm">Loading…</div>
  if (!reasoning) return (
    <div className="flex-1 flex items-center justify-center text-zinc-500 text-sm px-4 text-center">
      No reasoning available. Generate a resume to see AI decisions.
    </div>
  )
  return (
    <div className="flex-1 overflow-y-auto px-4 py-3 [&_h2]:text-sm [&_h2]:font-semibold [&_h2]:text-indigo-300 [&_h2]:mt-4 [&_h2]:mb-1 [&_p]:text-sm [&_p]:text-zinc-300 [&_p]:leading-relaxed [&_ul]:text-sm [&_ul]:text-zinc-300 [&_ul]:list-disc [&_ul]:pl-4 [&_li]:mb-0.5">
      <ReactMarkdown>{reasoning}</ReactMarkdown>
    </div>
  )
}

// ── Cover Letter Panel ────────────────────────────────────────────────────────

function CoverPanel({ text, loading, error, onGenerate, onCopy, copied, hasOutput }: {
  text: string | null
  loading: boolean
  error: string
  onGenerate: () => void
  onCopy: () => void
  copied: boolean
  hasOutput: boolean
}) {
  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-700 shrink-0">
        <p className="text-xs text-zinc-500 uppercase tracking-wide">Cover Letter</p>
        <div className="flex gap-2">
          {text && (
            <button onClick={onCopy} className="text-xs text-zinc-400 hover:text-zinc-200">
              {copied ? '✓ Copied' : 'Copy'}
            </button>
          )}
          <button
            onClick={onGenerate}
            disabled={loading}
            className="text-xs text-indigo-400 hover:text-indigo-300 disabled:opacity-50"
          >
            {loading ? 'Generating…' : text ? 'Regenerate' : 'Generate'}
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {error && <p className="text-xs text-red-400 mb-2">{error}</p>}
        {!hasOutput && !text && !loading && (
          <p className="text-sm text-zinc-500">Generate a resume for this job first, then generate a cover letter.</p>
        )}
        {loading && !text && (
          <p className="text-sm text-zinc-500 animate-pulse">Generating…</p>
        )}
        {text && (
          <pre className="text-sm text-zinc-300 whitespace-pre-wrap leading-relaxed font-sans">{text}</pre>
        )}
      </div>
    </div>
  )
}

// ── Field helper ──────────────────────────────────────────────────────────────

function Field({ label, value, valueClass = 'text-zinc-300' }: { label: string; value: string; valueClass?: string }) {
  return (
    <div>
      <span className="text-zinc-500">{label} </span>
      <span className={valueClass}>{value}</span>
    </div>
  )
}

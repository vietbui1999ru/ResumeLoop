'use client'
import { useEffect, useRef, useState, Fragment } from 'react'
import { createPortal } from 'react-dom'
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
import { PIPELINE_TAGS, PIPELINE_TAG_KEYS, TAG_TO_ACTION, ACTION_TO_TAG } from '@/lib/pipeline-tags'
import PdfViewer from './PdfViewer'
import OutreachPanel from './OutreachPanel'
import { motion, AnimatePresence } from 'framer-motion'
import { DURATION, EASE } from '@/lib/motion'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { X } from 'lucide-react'

// ── Types ────────────────────────────────────────────────────────────────────

type PanelId = 'jd' | 'pdf' | 'reasoning' | 'cover' | 'outreach' | 'case'

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
  onTagsChange?: (tags: string[]) => void
  currentAction?: string
  onActionChange?: (action: string) => void
}

const fmtDate = (iso: string | null) => {
  if (!iso) return '—'
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Mobile panels configuration
const PANELS: { id: PanelId; label: string }[] = [
  { id: 'jd',        label: 'JD' },
  { id: 'pdf',       label: 'PDF' },
  { id: 'reasoning', label: 'Reasoning' },
  { id: 'cover',     label: 'Cover' },
  { id: 'outreach',  label: 'Outreach' },
  { id: 'case',      label: 'Case' },
]

// ── SortablePanel wrapper ─────────────────────────────────────────────────────

function SortablePanel({ id, children, flexGrow }: { id: PanelId; children: React.ReactNode; flexGrow: number }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id })
  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        flexGrow,
        flexShrink: 1,
        flexBasis: 0,
        minWidth: 150,
      }}
      className={`flex flex-col overflow-hidden ${isDragging ? 'opacity-50 z-10' : ''}`}
    >
      {/* Drag handle strip */}
      <div
        {...attributes}
        {...listeners}
        className="flex items-center justify-center h-5 cursor-grab active:cursor-grabbing bg-zinc-800/50 border-b border-zinc-700 shrink-0 select-none"
        title="Drag to reorder"
      >
        <span className="text-zinc-400 text-xs">⠿</span>
      </div>
      {children}
    </div>
  )
}

// ── Panel resize divider ──────────────────────────────────────────────────────

function ResizeDivider({ leftId, rightId, onResize }: {
  leftId: PanelId
  rightId: PanelId
  onResize: (leftId: PanelId, rightId: PanelId, delta: number) => void
}) {
  const [dragging, setDragging] = useState(false)

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    e.preventDefault()
    e.stopPropagation()
    let lastX = e.clientX
    const el = e.currentTarget
    el.setPointerCapture(e.pointerId)
    setDragging(true)

    function onMove(ev: PointerEvent) {
      const delta = ev.clientX - lastX
      lastX = ev.clientX
      onResize(leftId, rightId, delta)
    }

    function onUp() {
      el.removeEventListener('pointermove', onMove as EventListener)
      setDragging(false)
    }

    el.addEventListener('pointermove', onMove as EventListener)
    el.addEventListener('pointerup', onUp, { once: true })
  }

  return (
    <div
      className={`w-1.5 shrink-0 cursor-col-resize transition-colors select-none ${
        dragging ? 'bg-indigo-500' : 'bg-zinc-700/60 hover:bg-indigo-500/70'
      }`}
      onPointerDown={handlePointerDown}
      title="Drag to resize panels"
    />
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function JobDetailModal({ jobId, onClose, onTagsChange, currentAction, onActionChange }: Props) {
  const [mounted, setMounted] = useState(false)
  const [job, setJob] = useState<JobDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [localTags, setLocalTags] = useState<string[]>([])
  const { output, loading: outputLoading } = useJobOutput(jobId)

  // Media query for desktop vs mobile
  const isDesktop = useMediaQuery('(min-width: 1024px)')

  // Apply URL state (editable, persisted via PATCH)
  const [applyUrl, setApplyUrl] = useState<string | null>(null)
  const [applyUrlSaving, setApplyUrlSaving] = useState(false)

  // Mobile sheet active panel
  const [activePanel, setActivePanel] = useState<PanelId>('jd')

  // Panel state
  const [panelOrder, setPanelOrder] = useState<PanelId[]>(['jd', 'pdf', 'reasoning', 'cover', 'outreach', 'case'])
  const [openPanels, setOpenPanels] = useState<Set<PanelId>>(new Set<PanelId>(['jd']))

  // Per-panel flex-grow widths (equal by default)
  const [panelWidths, setPanelWidths] = useState<Record<PanelId, number>>(
    { jd: 1, pdf: 1, reasoning: 1, cover: 1, outreach: 1, case: 1 }
  )

  // Manual modal size (null = auto-size by panel count)
  const [modalSize, setModalSize] = useState<{ width: number; height: number } | null>(null)
  const modalRef = useRef<HTMLDivElement>(null)
  const panelsContainerRef = useRef<HTMLDivElement>(null)
  const coverReaderRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null)
  const caseReaderRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null)
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Cover letter state
  const [coverLetter, setCoverLetter] = useState<string | null>(null)
  const [coverLoading, setCoverLoading] = useState(false)
  const [coverError, setCoverError] = useState('')
  const [copied, setCopied] = useState(false)

  // Application case state
  const [caseText, setCaseText] = useState<string | null>(null)
  const [caseLoading, setCaseLoading] = useState(false)
  const [caseStreaming, setCaseStreaming] = useState(false)
  const [caseError, setCaseError] = useState('')

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
    const ac = new AbortController()
    fetch(`/api/jobs/${jobId}`, { signal: ac.signal })
      .then(r => r.ok ? r.json() as Promise<JobDetail> : Promise.reject(r.status))
      .then((j: JobDetail) => {
        setJob(j)
        setApplyUrl(j.apply_url)
        try { setLocalTags(JSON.parse(j.tags || '[]')) } catch { setLocalTags([]) }
      })
      .catch(e => { if ((e as DOMException)?.name !== 'AbortError') setError('Failed to load job') })
      .finally(() => { if (!ac.signal.aborted) setLoading(false) })
    return () => ac.abort()
  }, [jobId])

  async function saveApplyUrl(url: string | null) {
    setApplyUrlSaving(true)
    try {
      await fetch(`/api/jobs/${jobId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apply_url: url }),
      })
    } finally {
      setApplyUrlSaving(false)
    }
  }

  // Escape to close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  // Lock body scroll while the modal is open so the page cannot scroll behind
  // the overlay. Without this, the page position shifts when the modal opens,
  // causing the modal (position: fixed; inset: 0) to appear pushed down.
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  // Portal mount guard — only render the portal after hydration to avoid
  // SSR mismatch (document.body is not available on the server).
  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    return () => {
      coverReaderRef.current?.cancel()
      caseReaderRef.current?.cancel()
      if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current)
    }
  }, [])

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
      const next = new Set<PanelId>(arr.concat(id))
      if (id === 'case') setTimeout(loadCase, 0)
      return next
    })
  }

  // ── Panel resize ────────────────────────────────────────────────────────────

  // Keep a ref so the ResizeDivider closure always calls the latest handler
  // (avoids stale-closure issues on the panel pointer-capture listener)
  const visiblePanelsRef = useRef<PanelId[]>([])

  function handlePanelResize(leftId: PanelId, rightId: PanelId, deltaPixels: number) {
    const container = panelsContainerRef.current
    if (!container) return
    const containerWidth = container.clientWidth
    if (containerWidth === 0) return
    const visible = visiblePanelsRef.current

    setPanelWidths(prev => {
      const totalGrow = visible.reduce((sum, id) => sum + (prev[id] ?? 1), 0)
      const growPerPixel = totalGrow / containerWidth
      const growDelta = deltaPixels * growPerPixel
      // Minimum panel: 150px worth of flex-grow
      const minGrow = Math.max(0.05, totalGrow * (150 / containerWidth))
      return {
        ...prev,
        [leftId]: Math.max(minGrow, (prev[leftId] ?? 1) + growDelta),
        [rightId]: Math.max(minGrow, (prev[rightId] ?? 1) - growDelta),
      }
    })
  }

  // ── Modal resize ────────────────────────────────────────────────────────────

  function startModalResize(e: React.PointerEvent, dir: 'se' | 's' | 'e') {
    e.preventDefault()
    e.stopPropagation()
    const rect = modalRef.current!.getBoundingClientRect()
    const startX = e.clientX
    const startY = e.clientY
    const startW = rect.width
    const startH = rect.height

    function onMove(ev: PointerEvent) {
      const dX = ev.clientX - startX
      const dY = ev.clientY - startY
      setModalSize({
        width:  dir !== 's' ? Math.max(480, Math.min(window.innerWidth  - 32, startW + dX)) : startW,
        height: dir !== 'e' ? Math.max(300, Math.min(window.innerHeight - 32, startH + dY)) : startH,
      })
    }

    function onUp() {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  function resetLayout() {
    setModalSize(null)
    setPanelWidths({ jd: 1, pdf: 1, reasoning: 1, cover: 1, outreach: 1, case: 1 })
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
      if (!res.ok) { setCoverError('Generation failed.'); return }
      const reader = res.body!.getReader()
      coverReaderRef.current = reader
      const decoder = new TextDecoder()
      let text = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        text += decoder.decode(value, { stream: true })
        setCoverLetter(text)
      }
    } catch (e) {
      if (e instanceof Error && e.name !== 'AbortError') setCoverError(String(e))
    } finally {
      coverReaderRef.current = null
      setCoverLoading(false)
    }
  }

  async function copyToClipboard() {
    if (!coverLetter) return
    await navigator.clipboard.writeText(coverLetter)
    if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current)
    setCopied(true)
    copiedTimerRef.current = setTimeout(() => setCopied(false), 2000)
  }

  async function loadCase() {
    if (caseText !== null) return
    setCaseLoading(true)
    try {
      const res = await fetch(`/api/jobs/${jobId}/case`)
      if (res.ok) {
        const data = await res.json() as { case: string | null }
        setCaseText(data.case)
      }
    } catch { /* ignore */ } finally {
      setCaseLoading(false)
    }
  }

  async function generateCase() {
    setCaseStreaming(true)
    setCaseError('')
    setCaseText('')
    setOpenPanels(prev => new Set<PanelId>(Array.from(prev).concat('case')))
    try {
      const res = await fetch(`/api/jobs/${jobId}/case`, { method: 'POST' })
      if (!res.ok) { setCaseError('Generation failed.'); return }
      const reader = res.body!.getReader()
      caseReaderRef.current = reader
      const decoder = new TextDecoder()
      let text = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        text += decoder.decode(value, { stream: true })
        setCaseText(text)
      }
    } catch (e) {
      if (e instanceof Error && e.name !== 'AbortError') setCaseError(String(e))
    } finally {
      caseReaderRef.current = null
      setCaseStreaming(false)
    }
  }

  async function handleTagToggle(key: string) {
    const next = localTags.includes(key) ? localTags.filter(t => t !== key) : [...localTags, key]
    setLocalTags(next)
    onTagsChange?.(next)
    try {
      await fetch(`/api/jobs/${jobId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tags: next }),
      })
    } catch { /* ignore — optimistic update already applied */ }
  }

  const tags: string[] = (() => { try { return JSON.parse(job?.tags || '[]') } catch { return [] } })()
  const visiblePanels = panelOrder.filter(id => openPanels.has(id))
  visiblePanelsRef.current = visiblePanels  // keep ref in sync for resize handler
  const panelCount = visiblePanels.length

  // Auto modal width when not manually sized
  const autoModalWidth =
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
    case: 'Case',
  }

  // Render mobile panel content
  function renderMobilePanel(panelId: PanelId): React.ReactNode {
    switch (panelId) {
      case 'jd':
        return job ? (
          <JdPanel
            job={job}
            tags={tags}
            localTags={localTags}
            onTagToggle={handleTagToggle}
            output={output}
            outputLoading={outputLoading}
            onGenCoverLetter={generateCoverLetter}
            coverLoading={coverLoading}
            applyUrl={applyUrl}
            onSaveApplyUrl={saveApplyUrl}
            applyUrlSaving={applyUrlSaving}
            currentAction={currentAction}
            onActionChange={onActionChange}
          />
        ) : null
      case 'pdf':
        return <PdfPanel jobId={jobId} hasPdf={!!output?.pdf_path} hasDocx={!!output} />
      case 'reasoning':
        return <ReasoningPanel reasoning={output?.reasoning ?? null} loading={outputLoading} />
      case 'cover':
        return (
          <CoverPanel
            text={coverLetter}
            loading={coverLoading}
            error={coverError}
            onGenerate={generateCoverLetter}
            onCopy={copyToClipboard}
            copied={copied}
            hasOutput={!!output}
          />
        )
      case 'outreach':
        return <OutreachPanel jobId={jobId} />
      case 'case':
        return (
          <CasePanel
            text={caseText}
            loading={caseLoading}
            streaming={caseStreaming}
            error={caseError}
            onGenerate={generateCase}
          />
        )
      default:
        return null
    }
  }

  // Mobile bottom sheet
  if (mounted && !isDesktop) {
    return createPortal(
      <AnimatePresence>
        {/* Backdrop */}
        <motion.div
          className="fixed inset-0 bg-black/60 z-40"
          onClick={onClose}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        />
        {/* Sheet */}
        <motion.div
          className="fixed bottom-0 left-0 right-0 z-50 bg-surface-card
                     rounded-t-2xl flex flex-col h-[90dvh]"
          onClick={e => e.stopPropagation()}
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          transition={{ type: 'spring', damping: 28, stiffness: 300 }}
        >
          {/* Drag handle indicator */}
          <div className="flex justify-center pt-2 pb-1 shrink-0">
            <div className="w-10 h-1 rounded-full bg-zinc-600" />
          </div>

          {/* Header: company/role + close */}
          <div className="flex items-center justify-between px-4 py-3
                          border-b border-zinc-800 shrink-0">
            <div>
              <p className="text-sm font-semibold text-zinc-100">{job?.company ?? ''}</p>
              <p className="text-xs text-zinc-400">{job?.role_title ?? ''}</p>
            </div>
            <button
              onClick={onClose}
              className="w-9 h-9 flex items-center justify-center
                         text-text-muted hover:text-text-secondary rounded-lg"
            >
              <X size={16} />
            </button>
          </div>

          {/* Scrollable tab bar */}
          <div className="flex overflow-x-auto border-b border-zinc-800 shrink-0
                          bg-surface-card [scrollbar-width:none] [-webkit-overflow-scrolling:touch]">
            {PANELS.map(({ id, label }) => (
              <button
                key={id}
                onClick={() => setActivePanel(id)}
                className={`px-4 py-2.5 text-xs font-medium whitespace-nowrap
                            border-b-2 transition-colors duration-100 shrink-0 ${
                  activePanel === id
                    ? 'border-indigo-500 text-indigo-400'
                    : 'border-transparent text-text-muted hover:text-text-secondary'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Panel content */}
          <div className="flex-1 overflow-y-auto pb-[env(safe-area-inset-bottom)]">
            <AnimatePresence mode="wait">
              <motion.div
                key={activePanel}
                initial={{ opacity: 0, x: 8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -8 }}
                transition={{ duration: 0.1 }}
                className="min-h-full"
              >
                {renderMobilePanel(activePanel)}
              </motion.div>
            </AnimatePresence>
          </div>
        </motion.div>
      </AnimatePresence>,
      document.body
    )
  }

  const modalContent = (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: DURATION.fast, ease: EASE }}
      onClick={onClose}
    >
      <motion.div
        ref={modalRef}
        className={`relative bg-surface-card border border-zinc-800 rounded-2xl flex flex-col mx-4 overflow-hidden ${
          modalSize
            ? ''
            : `w-full ${autoModalWidth} max-h-[92vh] transition-all duration-150`
        }`}
        style={modalSize ? { width: modalSize.width, height: modalSize.height } : undefined}
        initial={{ scale: 0.96, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.96, opacity: 0 }}
        transition={{ duration: DURATION.base, ease: EASE }}
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
          <div className="flex items-center gap-2 ml-4">
            {modalSize && (
              <button
                onClick={resetLayout}
                className="text-xs text-zinc-500 hover:text-zinc-300 px-2 py-0.5 rounded border border-zinc-700 hover:border-zinc-500 transition-colors"
                title="Reset panel and modal sizes"
              >
                Reset layout
              </button>
            )}
            <button onClick={onClose} className="text-zinc-500 hover:text-zinc-200 text-lg leading-none">✕</button>
          </div>
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
              <div ref={panelsContainerRef} className="flex flex-1 min-h-0 overflow-hidden">
                {visiblePanels.map((id, i) => (
                  <Fragment key={id}>
                    <SortablePanel id={id} flexGrow={panelWidths[id] ?? 1}>
                      {id === 'jd' && job && (
                        <JdPanel
                          job={job}
                          tags={tags}
                          localTags={localTags}
                          onTagToggle={handleTagToggle}
                          output={output}
                          outputLoading={outputLoading}
                          onGenCoverLetter={generateCoverLetter}
                          coverLoading={coverLoading}
                          applyUrl={applyUrl}
                          onSaveApplyUrl={saveApplyUrl}
                          applyUrlSaving={applyUrlSaving}
                          currentAction={currentAction}
                          onActionChange={onActionChange}
                        />
                      )}
                      {id === 'pdf' && <PdfPanel jobId={jobId} hasPdf={!!output?.pdf_path} hasDocx={!!output} />}
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
                      {id === 'case' && (
                        <CasePanel
                          text={caseText}
                          loading={caseLoading}
                          streaming={caseStreaming}
                          error={caseError}
                          onGenerate={generateCase}
                        />
                      )}
                    </SortablePanel>

                    {i < visiblePanels.length - 1 && (
                      <ResizeDivider
                        leftId={id}
                        rightId={visiblePanels[i + 1]}
                        onResize={handlePanelResize}
                      />
                    )}
                  </Fragment>
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}

        {/* Modal resize handles */}
        {/* Right edge */}
        <div
          className="absolute top-8 right-0 w-2 cursor-ew-resize select-none"
          style={{ bottom: 8 }}
          onPointerDown={e => startModalResize(e, 'e')}
        />
        {/* Bottom edge */}
        <div
          className="absolute bottom-0 left-8 h-2 cursor-ns-resize select-none"
          style={{ right: 8 }}
          onPointerDown={e => startModalResize(e, 's')}
        />
        {/* Bottom-right corner grip */}
        <div
          className="absolute bottom-0 right-0 w-5 h-5 cursor-se-resize z-10 flex items-end justify-end pb-0.5 pr-0.5 select-none group"
          onPointerDown={e => startModalResize(e, 'se')}
          title="Drag to resize"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" className="text-zinc-400 group-hover:text-indigo-400 transition-colors">
            <path d="M2 9 L9 2 M5 9 L9 5 M8 9 L9 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </div>
      </motion.div>
    </motion.div>
  )

  if (!mounted || !isDesktop) return null
  return createPortal(modalContent, document.body)
}

// ── JD Panel ──────────────────────────────────────────────────────────────────

function JdPanel({ job, tags, localTags, onTagToggle, output, outputLoading, onGenCoverLetter, coverLoading, applyUrl, onSaveApplyUrl, applyUrlSaving, currentAction, onActionChange }: {
  job: JobDetail
  tags: string[]
  localTags: string[]
  onTagToggle: (key: string) => void
  output: ReturnType<typeof useJobOutput>['output']
  outputLoading: boolean
  onGenCoverLetter: () => void
  coverLoading: boolean
  applyUrl: string | null
  onSaveApplyUrl: (url: string | null) => Promise<void>
  applyUrlSaving: boolean
  currentAction?: string
  onActionChange?: (action: string) => void
}) {
  const [editingUrl, setEditingUrl] = useState(false)
  const [urlDraft, setUrlDraft] = useState('')
  // Guard against javascript: URLs — only allow http(s)
  const safeApplyUrl = applyUrl?.match(/^https?:\/\//) ? applyUrl : null

  function startEdit() {
    setUrlDraft(applyUrl ?? '')
    setEditingUrl(true)
  }

  async function commitUrl() {
    await onSaveApplyUrl(urlDraft.trim() || null)
    setEditingUrl(false)
  }

  const effectiveAction = currentAction ?? job.action ?? '0-Saved'

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-y-auto">
      {/* Structured fields */}
      <div className="px-4 py-3 border-b border-zinc-700 grid grid-cols-2 gap-x-6 gap-y-2 text-sm shrink-0">
        <Field label="Track"   value={job.role_track || '—'} />
        <Field label="Fit"     value={`${job.fit_pct}%`} valueClass={job.fit_pct >= 60 ? 'text-green-400' : 'text-zinc-300'} />
        <Field label="Action"  value={effectiveAction} />
        <Field label="Visa"    value={job.visa_status} valueClass={job.visa_status === 'kill' ? 'text-red-400' : 'text-green-400'} />
        <Field label="Clipped" value={fmtDate(job.file_mtime)} />
        <Field label="Scanned" value={fmtDate(job.scanned_at)} />
        <div className="col-span-2">
          <p className="text-zinc-500 text-xs mb-1">Stage</p>
          <div className="flex gap-1.5 flex-wrap">
            {PIPELINE_TAGS.map(tag => {
              const active = ACTION_TO_TAG[effectiveAction as keyof typeof ACTION_TO_TAG] === tag.key
              return (
                <button
                  key={tag.key}
                  onClick={() => {
                    const next = active ? '0-Saved' : (TAG_TO_ACTION[tag.key as keyof typeof TAG_TO_ACTION] ?? '0-Saved')
                    onActionChange?.(next)
                  }}
                  className={`px-2 py-0.5 rounded text-xs border transition-all font-medium ${
                    active ? tag.pill : 'bg-zinc-800/50 text-zinc-500 border-zinc-700 hover:text-zinc-300 hover:border-zinc-500'
                  }`}
                >
                  {tag.label}
                </button>
              )
            })}
          </div>
        </div>
        {tags.filter(t => !PIPELINE_TAG_KEYS.includes(t as never)).length > 0 && (
          <div className="col-span-2">
            <span className="text-zinc-500">Tags </span>
            {tags.filter(t => !PIPELINE_TAG_KEYS.includes(t as never))
              .map(t => <span key={t} className="inline-block mr-1 px-1.5 py-0.5 bg-zinc-800 rounded text-xs text-zinc-300">{t}</span>)}
          </div>
        )}
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
          ) : safeApplyUrl ? (
            <span className="inline-flex items-center gap-2">
              <a href={safeApplyUrl} target="_blank" rel="noreferrer" className="text-xs text-indigo-400 hover:text-indigo-300 underline truncate max-w-xs">
                {safeApplyUrl}
              </a>
              <button onClick={startEdit} className="text-xs text-zinc-400 hover:text-zinc-400">Edit</button>
            </span>
          ) : (
            <button onClick={startEdit} className="text-xs text-zinc-500 hover:text-zinc-300 underline">+ Add apply link</button>
          )}
        </div>
      </div>

      {/* Actions row */}
      <div className="px-4 py-2 border-b border-zinc-700 flex flex-wrap gap-3 items-center shrink-0">
        <a href={`file://${job.file_path}`} target="_blank" rel="noreferrer" className="text-xs text-indigo-400 hover:text-indigo-300">Open file ↗</a>
        {safeApplyUrl && (
          <a href={safeApplyUrl} target="_blank" rel="noreferrer" className="text-xs text-green-400 hover:text-green-300">Apply ↗</a>
        )}
        {!outputLoading && output && (
          <>
            <a href={`/api/jobs/${job.id}/output/download?format=docx`} download className="text-xs text-indigo-400 hover:text-indigo-300">↓ DOCX</a>
            {output.pdf_path ? (
              <a href={`/api/jobs/${job.id}/output/download?format=pdf`} download className="text-xs text-indigo-400 hover:text-indigo-300">↓ PDF</a>
            ) : (
              <span className="text-xs text-zinc-600 cursor-not-allowed" title="PDF not available">↓ PDF</span>
            )}
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
          {output.tagline && <p className="text-xs text-zinc-300 italic mb-1">&ldquo;{output.tagline}&rdquo;</p>}
          <div className="flex flex-wrap gap-x-3 text-xs text-zinc-500">
            {output.variant && <span>Track: <span className="text-zinc-400">{output.variant}</span></span>}
            {output.built_at && <span>Built: <span className="text-zinc-400">{fmtDate(output.built_at)}</span></span>}
          </div>
        </div>
      )}

      {/* Markdown JD content */}
      <div className="flex-1 px-4 py-3 overflow-y-auto text-sm text-zinc-300 leading-relaxed [&_h1]:text-zinc-100 [&_h1]:font-semibold [&_h1]:text-base [&_h1]:mt-3 [&_h1]:mb-1 [&_h2]:text-zinc-200 [&_h2]:font-semibold [&_h2]:text-sm [&_h2]:mt-3 [&_h2]:mb-1 [&_h3]:text-zinc-200 [&_h3]:font-medium [&_h3]:mt-2 [&_h3]:mb-0.5 [&_ul]:list-disc [&_ul]:pl-4 [&_ul]:space-y-0.5 [&_ol]:list-decimal [&_ol]:pl-4 [&_ol]:space-y-0.5 [&_strong]:text-zinc-100 [&_a]:text-indigo-400 [&_a:hover]:text-indigo-300 [&_p]:mb-2 [&_hr]:border-zinc-700 [&_hr]:my-3">
        <ReactMarkdown>{job.raw_content || '(no content)'}</ReactMarkdown>
      </div>
    </div>
  )
}

// ── PDF Panel ─────────────────────────────────────────────────────────────────

function PdfPanel({ jobId, hasPdf, hasDocx }: { jobId: string; hasPdf: boolean; hasDocx: boolean }) {
  const [pdfReady, setPdfReady] = useState(hasPdf)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [retryKey, setRetryKey] = useState(0)
  const inFlight = useRef(false)

  // Sync pdfReady when hasPdf arrives async (output loads after mount)
  useEffect(() => {
    if (hasPdf) setPdfReady(true)
  }, [hasPdf])

  useEffect(() => {
    if (!hasDocx || pdfReady || inFlight.current) return
    inFlight.current = true
    let cancelled = false
    setGenerating(true)
    setError(null)
    fetch(`/api/jobs/${jobId}/output/pdf`, { method: 'POST' })
      .then(async res => {
        if (cancelled) return
        if (res.ok || res.status === 409) {
          setPdfReady(true)
        } else {
          const body = await res.json().catch(() => ({})) as { error?: string }
          setError(body.error ?? `Generation failed (${res.status})`)
        }
      })
      .catch(e => { if (!cancelled) setError(String(e)) })
      .finally(() => { if (!cancelled) setGenerating(false); inFlight.current = false })
    return () => { cancelled = true }
  }, [jobId, hasDocx, pdfReady, retryKey])

  if (!hasDocx) {
    return (
      <div className="flex-1 flex items-center justify-center text-zinc-500 text-sm px-4 text-center">
        Generate a DOCX resume first — PDF preview requires a generated resume for this job.
      </div>
    )
  }
  if (error) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 px-4">
        <p className="text-red-400 text-sm text-center">{error}</p>
        <button
          onClick={() => { setError(null); setRetryKey(k => k + 1) }}
          className="px-3 py-1.5 text-xs bg-zinc-700 hover:bg-zinc-600 rounded text-zinc-200"
        >
          Retry
        </button>
      </div>
    )
  }
  if (generating || !pdfReady) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 px-4">
        <div className="w-full max-w-xs space-y-2">
          <div className="h-3 bg-zinc-700 rounded animate-pulse" />
          <div className="h-3 bg-zinc-700 rounded animate-pulse w-4/5" />
          <div className="h-3 bg-zinc-700 rounded animate-pulse w-3/5" />
        </div>
        <p className="text-zinc-500 text-sm">Generating PDF…</p>
      </div>
    )
  }
  return (
    <div className="flex-1 relative min-h-0">
      <PdfViewer url={`/api/jobs/${jobId}/output/pdf`} />
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

// ── Case Panel ────────────────────────────────────────────────────────────────

function CasePanel({ text, loading, streaming, error, onGenerate }: {
  text: string | null
  loading: boolean
  streaming: boolean
  error: string
  onGenerate: () => void
}) {
  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-700 shrink-0">
        <p className="text-xs text-zinc-500 uppercase tracking-wide">Application Case</p>
        <button
          onClick={onGenerate}
          disabled={streaming}
          className="text-xs text-indigo-400 hover:text-indigo-300 disabled:opacity-50"
        >
          {streaming ? 'Generating…' : text ? 'Regenerate' : 'Generate'}
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {error && <p className="text-xs text-red-400 mb-2">{error}</p>}
        {loading && <p className="text-sm text-zinc-500 animate-pulse">Loading…</p>}
        {!loading && !streaming && !text && !error && (
          <p className="text-sm text-zinc-500">
            Synthesizes outreach research, resume reasoning, and JD signals into a targeting brief.
            Press Generate to build it.
          </p>
        )}
        {streaming && !text && (
          <p className="text-sm text-zinc-500 animate-pulse">Generating…</p>
        )}
        {text && (
          <div className="[&_h2]:text-sm [&_h2]:font-semibold [&_h2]:text-indigo-300 [&_h2]:mt-4 [&_h2]:mb-1 [&_p]:text-sm [&_p]:text-zinc-300 [&_p]:leading-relaxed [&_ul]:text-sm [&_ul]:text-zinc-300 [&_ul]:list-disc [&_ul]:pl-4 [&_li]:mb-0.5 [&_ol]:text-sm [&_ol]:text-zinc-300 [&_ol]:list-decimal [&_ol]:pl-4 [&_strong]:text-zinc-100">
            <ReactMarkdown>{text}</ReactMarkdown>
          </div>
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

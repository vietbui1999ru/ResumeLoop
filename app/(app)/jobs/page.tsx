'use client'
import { useState, useEffect, useMemo, useCallback, useRef } from 'react'

const IS_CLOUD = process.env.NEXT_PUBLIC_APP_MODE === 'cloud'

import { extractAllTags, parseTags } from '@/lib/tag-filter'
import { FIT_THRESHOLDS } from '@/lib/tokens'
import { PIPELINE_TAGS } from '@/lib/pipeline-tags'
import dynamic from 'next/dynamic'
import { JobsTableSkeleton } from '@/components/JobsTableSkeleton'
import { AnimatedCheckbox } from '@/components/AnimatedCheckbox'
import SessionSwitcher from '@/components/SessionSwitcher'
import { VALID_ACTIONS } from '@/lib/actions'
import { useSession } from '@/contexts/SessionContext'
import { AnimatePresence } from 'framer-motion'
import { readUploadedMdFiles } from '@/lib/upload-md-files'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { JobCard } from '@/components/JobCard'
import { ACTION_COLORS, FitBadge, clipColor, fmtDate } from '@/lib/job-display'

const JobDetailModal  = dynamic(() => import('@/components/JobDetailModal'),  { ssr: false })
const GenerationPanel = dynamic(() => import('@/components/GenerationPanel'), { ssr: false })
const ReasoningModal  = dynamic(() => import('@/components/ReasoningModal'),  { ssr: false })
const SetupPanel      = dynamic(() => import('@/components/SetupPanel').then(m => ({ default: m.SetupPanel })), { ssr: false })
const JobImportGuide  = dynamic(() => import('@/components/JobImportGuide').then(m => ({ default: m.JobImportGuide })), { ssr: false })
const PasteJobModal   = dynamic(() => import('@/components/PasteJobModal').then(m => ({ default: m.PasteJobModal })), { ssr: false })

interface Job {
  id:           string
  company:      string
  role_title:   string
  role_track:   string
  fit_pct:      number
  visa_status:  string
  tags:         string
  action:       string | null
  file_mtime:   string | null
  clipped_at:   string | null
  scanned_at:   string | null
  has_reasoning: number
  has_output:    number
  hidden:        number
}

type SortCol = 'company' | 'role_title' | 'fit_pct' | 'action' | 'clipped_at'
type SortDir = 'asc' | 'desc'

const NUM_COLS: SortCol[] = ['fit_pct', 'clipped_at']

function SortTh({ label, col, sort, onSort, className = '' }: {
  label: string; col: SortCol; sort: { col: SortCol; dir: SortDir }
  onSort: (c: SortCol) => void; className?: string
}) {
  const active = sort.col === col
  return (
    <th
      className={`pb-2 pr-4 text-left cursor-pointer select-none whitespace-nowrap ${className}`}
      onClick={() => onSort(col)}
    >
      <span className={active ? 'text-indigo-400' : 'text-zinc-500'}>
        {label}{active ? (sort.dir === 'asc' ? ' ↑' : ' ↓') : ''}
      </span>
    </th>
  )
}


function jobSortVal(j: Job, col: SortCol): string | number {
  if (col === 'fit_pct')    return j.fit_pct
  if (col === 'clipped_at') return j.clipped_at ?? j.file_mtime ?? ''
  if (col === 'company')    return j.company
  if (col === 'role_title') return j.role_title
  return j.action ?? ''
}

export default function JobsPage() {
  const { activeSessionId } = useSession()
  const isDesktop = useMediaQuery('(min-width: 1024px)')
  const [jobs, setJobs]         = useState<Job[]>([])
  const [scanStatus, setScanStatus] = useState('')
  const [rowErrors, setRowErrors]   = useState<Map<string, string>>(new Map())
  const [showSecondary, setShowSecondary] = useState(false)

  // Unfiltered option lists — fetched once on mount so track/tag dropdowns
  // don't collapse when a filter is active (filtered jobs ≠ all jobs).
  const [allTracks, setAllTracks]       = useState<string[]>([])
  const [allTagOptions, setAllTagOptions] = useState<string[]>([])

  // Filters
  const [q, setQ]               = useState('')
  const [trackFilter, setTrackFilter] = useState('')
  const [fitMin, setFitMin]     = useState(0)
  const [visaFilter, setVisaFilter]   = useState<'all' | 'proceed' | 'kill'>('proceed')
  const [actionFilter, setActionFilter] = useState('')
  const [tagFilter, setTagFilter]     = useState('')
  const [fromDate, setFromDate] = useState('')
  const [showHidden, setShowHidden]   = useState(false)

  const [selectedJobId, setSelectedJobId]   = useState<string | null>(null)
  const [reasoningJobId, setReasoningJobId] = useState<string | null>(null)

  // Generation
  const [selected, setSelected]           = useState<Set<string>>(new Set())
  const [genStatus, setGenStatus]         = useState<Map<string, string>>(new Map())
  const [genErrors, setGenErrors]         = useState<Map<string, string>>(new Map())
  const [errorDetail, setErrorDetail]     = useState<string | null>(null)
  const [showPanel, setShowPanel]         = useState(false)
  const [panelMinimized, setPanelMinimized] = useState(false)
  const [generateQueue, setGenerateQueue] = useState<string[]>([])
  const [hasAiProvider, setHasAiProvider] = useState<boolean | null>(null)

  const [sort, setSort] = useState<{ col: SortCol; dir: SortDir }>({ col: 'clipped_at', dir: 'desc' })
  const [jobsPathExists, setJobsPathExists] = useState<boolean | null>(null)
  const [showImportGuide, setShowImportGuide] = useState(false)
  const [showPasteModal, setShowPasteModal]   = useState(false)
  // True only during the initial page load — shows skeleton rows in tbody.
  // Filter-change re-fetches keep the current rows visible (no skeleton flash).
  const [initialLoading, setInitialLoading] = useState(true)
  const abortRef = useRef<AbortController | null>(null)
  const uploadRef = useRef<HTMLInputElement>(null)

  // Debounced q for search — fires reload 300ms after typing stops
  const [debouncedQ, setDebouncedQ] = useState('')
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 300)
    return () => clearTimeout(t)
  }, [q])

  const reload = useCallback(() => {
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl

    const p = new URLSearchParams()
    if (debouncedQ)              p.set('q',        debouncedQ)
    if (showHidden)              p.set('showHidden','1')
    if (fitMin > 0)              p.set('fitMin',   String(fitMin))
    if (trackFilter)             p.set('track',    trackFilter)
    if (visaFilter !== 'proceed') p.set('visa',    visaFilter)
    if (actionFilter)            p.set('action',   actionFilter)
    if (tagFilter)               p.set('tag',      tagFilter)
    if (fromDate)                p.set('fromDate', fromDate)
    fetch(`/api/jobs?${p}`, { signal: ctrl.signal })
      .then(r => r.ok ? r.json() : [])
      .then(d => { setJobs(d); setInitialLoading(false) })
      .catch(e => { if (e.name !== 'AbortError') setInitialLoading(false) })
  }, [debouncedQ, showHidden, fitMin, trackFilter, visaFilter, actionFilter, tagFilter, fromDate])

  useEffect(() => {
    const ctrl = new AbortController()
    fetch('/api/settings', { signal: ctrl.signal })
      .then(r => r.ok ? r.json() : null)
      .then((d: Record<string, unknown> | null) => {
        setJobsPathExists(d ? Boolean(d.jobs_path_exists) : true)
      })
      .catch(e => { if (e.name !== 'AbortError') console.error(e) })
    return () => ctrl.abort()
  }, [])

  useEffect(() => {
    const ctrl = new AbortController()
    fetch('/api/settings/ai', { signal: ctrl.signal })
      .then(r => r.ok ? r.json() : null)
      .then((d: { active_provider: string | null } | null) => {
        setHasAiProvider(d ? d.active_provider !== null : false)
      })
      .catch(e => { if (e.name !== 'AbortError') console.error(e) })
    return () => ctrl.abort()
  }, [])

  // Fetch unfiltered job list once on mount for track/tag dropdown options.
  // Must run independently of the filtered reload so options don't collapse.
  useEffect(() => {
    const ctrl = new AbortController()
    fetch('/api/jobs', { signal: ctrl.signal })
      .then(r => r.ok ? r.json() as Promise<Job[]> : [])
      .then((all: Job[]) => {
        setAllTracks(Array.from(new Set(all.map(j => j.role_track).filter(Boolean))).sort())
        setAllTagOptions(extractAllTags(all))
      })
      .catch(e => { if (e.name !== 'AbortError') console.error(e) })
    return () => ctrl.abort()
  }, [])

  // Re-fetch whenever any filter changes (debouncedQ handles the search delay).
  // Cleanup aborts any in-flight request when filters change again or on unmount.
  useEffect(() => {
    reload()
    return () => { abortRef.current?.abort() }
  }, [reload])

  const onSort = (col: SortCol) =>
    setSort(prev => prev.col === col
      ? { col, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
      : { col, dir: NUM_COLS.includes(col) ? 'desc' : 'asc' })

  const toggleSelect = (id: string) =>
    setSelected(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n })

  const generate = async () => {
    const ids = Array.from(selected)
    if (ids.length === 0) return
    const res = await fetch('/api/generate', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobIds: ids }),
    })
    if (!res.ok) return
    setGenerateQueue(prev => {
      const existing = new Set(prev)
      const newIds = ids.filter(id => !existing.has(id))
      return [...prev, ...newIds]
    })
    setShowPanel(true)
    setPanelMinimized(false)
  }

  const setRowError = useCallback((id: string, msg: string) => {
    setRowErrors(prev => new Map(prev).set(id, msg))
    setTimeout(() => setRowErrors(prev => { const n = new Map(prev); n.delete(id); return n }), 3000)
  }, [])

  const hideJob = useCallback(async (jobId: string, hidden: 0 | 1) => {
    setJobs(prev => prev.map(j => j.id === jobId ? { ...j, hidden } : j))
    await fetch(`/api/jobs/${jobId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hidden }),
    })
  }, [])

  const handleTagToggle = useCallback(async (jobId: string, tagKey: string) => {
    const job = jobs.find(j => j.id === jobId)
    if (!job) return
    const current = parseTags(job)
    const next = current.includes(tagKey) ? current.filter(t => t !== tagKey) : [...current, tagKey]
    setJobs(prev => prev.map(j => j.id === jobId ? { ...j, tags: JSON.stringify(next) } : j))
    await fetch(`/api/jobs/${jobId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tags: next }),
    })
  }, [jobs])

  const handleActionChange = useCallback(async (jobId: string, newAction: string) => {
    setJobs(prev => prev.map(j => j.id === jobId ? { ...j, action: newAction } : j))
    const res = await fetch(`/api/jobs/${jobId}/action`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: newAction }),
    })
    if (!res.ok) {
      reload()
      const data = await res.json().catch(() => ({})) as { error?: string }
      setRowError(jobId, data.error ?? 'Save failed')
    }
  }, [reload, setRowError])

  const [editingTitleId, setEditingTitleId] = useState<string | null>(null)
  const [editingTitleVal, setEditingTitleVal] = useState('')

  const startTitleEdit = useCallback((jobId: string, current: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setEditingTitleId(jobId)
    setEditingTitleVal(current)
  }, [])

  const commitTitleEdit = useCallback(async () => {
    if (!editingTitleId || !editingTitleVal.trim()) { setEditingTitleId(null); return }
    const jobId = editingTitleId
    const title = editingTitleVal.trim()
    setEditingTitleId(null)
    setJobs(prev => prev.map(j => j.id === jobId ? { ...j, role_title: title } : j))
    const res = await fetch(`/api/jobs/${jobId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role_title: title }),
    })
    if (!res.ok) {
      reload()
      setRowError(jobId, 'Title save failed')
    }
  }, [editingTitleId, editingTitleVal, reload, setRowError])

  const visible = useMemo(() => {
    return [...jobs].sort((a, b) => {
      const va = jobSortVal(a, sort.col)
      const vb = jobSortVal(b, sort.col)
      const cmp = typeof va === 'number' && typeof vb === 'number'
        ? va - vb : String(va).localeCompare(String(vb))
      return sort.dir === 'asc' ? cmp : -cmp
    })
  }, [jobs, sort])

  const allVisibleSelected = visible.length > 0 && visible.every(j => selected.has(j.id))
  const toggleAll = () => setSelected(allVisibleSelected ? new Set() : new Set(visible.map(j => j.id)))

  const scanUploadedFiles = useCallback(async (pickedFiles: FileList | null) => {
    const { files, skipped: skippedNonMd } = await readUploadedMdFiles(pickedFiles)
    if (files.length === 0) {
      setScanStatus('No .md files selected.')
      setTimeout(() => setScanStatus(''), 4000)
      return
    }

    const res = await fetch('/api/batch/scan/files', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ files }),
    })
    const data = await res.json() as { processed?: number; skipped?: number; error?: string }
    const skippedTotal = (data.skipped ?? 0) + skippedNonMd
    setScanStatus(
      res.ok
        ? `↑ ${data.processed ?? 0} imported${skippedTotal > 0 ? ` (${skippedTotal} skipped)` : ''}`
        : `✗ ${data.error ?? 'scan failed'}`,
    )
    if (res.ok) reload()
    setTimeout(() => setScanStatus(''), 4000)
  }, [reload])

  const scan = async () => {
    setScanStatus('Scanning…')

    if (IS_CLOUD) {
      try {
        const supportsFsa = typeof window !== 'undefined' && 'showDirectoryPicker' in window
        if (supportsFsa) {
          const { loadHandle, readMdFiles, checkPermission, requestPermission } = await import('@/lib/cloud-fs')
          const handle = await loadHandle('jobs-folder')
          if (handle) {
            const perm = await checkPermission(handle)
            if (perm !== 'granted') {
              const ok = await requestPermission(handle)
              if (!ok) {
                setScanStatus('Folder permission denied — select .md files to upload.')
                uploadRef.current?.click()
                return
              }
            }
            const files = await readMdFiles(handle)
            const res = await fetch('/api/batch/scan/files', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ files }),
            })
            const data = await res.json() as { processed?: number; error?: string }
            setScanStatus(res.ok ? `↑ ${data.processed ?? 0} imported` : `✗ ${data.error ?? 'scan failed'}`)
            if (res.ok) reload()
            setTimeout(() => setScanStatus(''), 4000)
            return
          }
        }

        setScanStatus('Select one or more .md files to upload.')
        uploadRef.current?.click()
      } catch (e) {
        setScanStatus(`✗ ${(e as Error).message}`)
        setTimeout(() => setScanStatus(''), 4000)
      }
      return
    }

    // Local mode: server-side scan
    const res  = await fetch('/api/batch/scan', { method: 'POST' })
    const data = await res.json() as { scanned?: number; error?: string }
    setScanStatus(res.ok ? `↑ ${data.scanned} new` : `✗ ${data.error ?? 'scan failed'}`)
    if (res.ok) reload()
    setTimeout(() => setScanStatus(''), 4000)
  }

  const hasActiveSecondary = !!(trackFilter || tagFilter || fromDate || showHidden || visaFilter !== 'proceed')
  const drawerOpen = selected.size > 0 || showPanel

  return (
    <div className={`flex flex-col min-h-full ${drawerOpen ? 'pb-20' : ''}`}>

      {/* ── Sticky header ──────────────────────────────────────── */}
      <div className="sticky top-0 z-10 bg-surface-base border-b border-zinc-800">
        {isDesktop ? (
          <div className="px-6 pt-4 pb-3 space-y-2.5">

            {/* Row 1: title + scan */}
            <div className="flex items-center gap-3">
              <h1 className="text-lg font-semibold">Jobs</h1>
              <span className="text-xs text-zinc-500">{visible.length} shown</span>
              <SessionSwitcher />
              <div className="ml-auto flex items-center gap-2">
                {scanStatus && (
                  <span className={`text-xs ${scanStatus.startsWith('✗') ? 'text-red-400' : 'text-green-400'}`}>
                    {scanStatus}
                  </span>
                )}
                <button
                  data-tour="paste-jd-btn"
                  onClick={() => setShowPasteModal(true)}
                  className="text-sm px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded transition-colors text-zinc-300"
                  title="Paste a job posting (.md format)"
                >
                  Paste
                </button>
                <div data-tour="scan-btn" className="relative inline-block">
                  <button onClick={scan} className="text-sm px-3 py-1.5 bg-zinc-700 hover:bg-zinc-600 rounded transition-colors">
                    Scan
                  </button>
                </div>
              </div>
            </div>

            {/* Row 2: primary filters */}
            <div data-tour="filters-bar" className="flex items-center gap-2">
              <input
                value={q}
                onChange={e => setQ(e.target.value)}
                placeholder="Search company, role…"
                className="flex-1 min-w-0 h-8 rounded-lg bg-surface-card border border-zinc-800 text-sm px-2 text-text-secondary placeholder:text-text-muted focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30 transition-colors duration-100"
              />
              <select
                value={actionFilter}
                onChange={e => setActionFilter(e.target.value)}
                className="shrink-0 h-8 rounded-lg bg-surface-card border border-zinc-800 text-sm px-2 text-text-secondary focus:outline-none focus:border-indigo-500 transition-colors duration-100"
              >
                <option value="">All stages</option>
                {VALID_ACTIONS.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
              <div className="shrink-0 flex items-center gap-0.5 h-8 bg-surface-card border border-zinc-800 rounded-lg px-2 transition-colors duration-100">
                <span className="text-text-muted text-xs mr-1">Fit</span>
                {([0, 60, 70, 80, 90] as const).map(val => (
                  <button
                    key={val}
                    onClick={() => setFitMin(val)}
                    className={`px-1.5 py-0.5 rounded text-xs transition-colors ${
                      fitMin === val
                        ? 'bg-indigo-600 text-white'
                        : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700'
                    }`}
                  >
                    {val === 0 ? 'Any' : `${val}%`}
                  </button>
                ))}
              </div>
              <button
                onClick={() => setShowSecondary(v => !v)}
                className={`shrink-0 text-sm px-3 py-1.5 rounded border transition-colors ${
                  hasActiveSecondary
                    ? 'border-indigo-500 text-indigo-400 bg-indigo-950/30'
                    : showSecondary
                      ? 'border-zinc-500 text-zinc-300 bg-zinc-800'
                      : 'border-zinc-700 text-zinc-400 hover:text-zinc-200'
                }`}
              >
                Filters{hasActiveSecondary ? ' ●' : ' ▾'}
              </button>
            </div>

            {/* Secondary filters */}
            {showSecondary && (
              <div className="flex flex-wrap gap-2 pt-0.5">
                <select
                  value={trackFilter}
                  onChange={e => setTrackFilter(e.target.value)}
                  className="h-8 rounded-lg bg-surface-card border border-zinc-800 text-sm px-2 text-text-secondary focus:outline-none focus:border-indigo-500 transition-colors duration-100"
                >
                  <option value="">All tracks</option>
                  {allTracks.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                <select
                  value={tagFilter}
                  onChange={e => setTagFilter(e.target.value)}
                  className="h-8 rounded-lg bg-surface-card border border-zinc-800 text-sm px-2 text-text-secondary focus:outline-none focus:border-indigo-500 transition-colors duration-100"
                >
                  <option value="">All tags</option>
                  {allTagOptions.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                <select
                  value={visaFilter}
                  onChange={e => setVisaFilter(e.target.value as typeof visaFilter)}
                  className="h-8 rounded-lg bg-surface-card border border-zinc-800 text-sm px-2 text-text-secondary focus:outline-none focus:border-indigo-500 transition-colors duration-100"
                >
                  <option value="proceed">Visa: proceed</option>
                  <option value="kill">Visa: kill</option>
                  <option value="all">Visa: all</option>
                </select>
                <div className="flex items-center gap-1.5 bg-zinc-800 border border-zinc-700 rounded px-2.5 py-1.5 text-sm">
                  <span className="text-zinc-500">From</span>
                  <input
                    type="date"
                    value={fromDate}
                    onChange={e => setFromDate(e.target.value)}
                    className="bg-transparent text-zinc-200 [color-scheme:dark]"
                  />
                  {fromDate && (
                    <button onClick={() => setFromDate('')} className="text-zinc-500 hover:text-zinc-300">✕</button>
                  )}
                </div>
                <button
                  onClick={() => setShowHidden(v => !v)}
                  className={`text-sm px-3 py-1.5 rounded border transition-colors ${
                    showHidden ? 'border-amber-500 text-amber-400' : 'border-zinc-700 text-zinc-500 hover:text-zinc-300'
                  }`}
                >
                  Show hidden
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="px-4 pt-3 pb-2 space-y-2">
            {/* Mobile Row 1: title + count + buttons */}
            <div className="flex items-center gap-2">
              <h1 className="text-base font-semibold">Jobs</h1>
              <span className="text-xs text-zinc-500">{visible.length}</span>
              <div className="ml-auto flex items-center gap-1.5">
                {scanStatus && (
                  <span className={`text-xs ${scanStatus.startsWith('✗') ? 'text-red-400' : 'text-green-400'}`}>
                    {scanStatus}
                  </span>
                )}
                <button
                  onClick={() => setShowPasteModal(true)}
                  className="text-xs px-2.5 py-1.5 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded transition-colors text-zinc-300"
                >Paste</button>
                <button
                  onClick={scan}
                  className="text-xs px-2.5 py-1.5 bg-zinc-700 hover:bg-zinc-600 rounded transition-colors"
                >Scan</button>
              </div>
            </div>
            {/* Mobile Row 2: search */}
            <input
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="Search company, role…"
              className="w-full h-9 rounded-lg bg-surface-card border border-zinc-800 text-sm px-3
                         text-text-secondary placeholder:text-text-muted focus:outline-none
                         focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30 transition-colors"
            />
            {/* Mobile Row 3: filters toggle */}
            <button
              onClick={() => setShowSecondary(v => !v)}
              className={`w-full flex items-center justify-between h-9 px-3 rounded-lg border text-sm transition-colors ${
                hasActiveSecondary
                  ? 'border-indigo-500 text-indigo-400 bg-indigo-950/30'
                  : 'border-zinc-700 text-zinc-400'
              }`}
            >
              <span>Filters{hasActiveSecondary ? ` (${[trackFilter, tagFilter, fromDate].filter(Boolean).length + (visaFilter !== 'proceed' ? 1 : 0) + (showHidden ? 1 : 0)} active)` : ''}</span>
              <span>{showSecondary ? '▴' : '▾'}</span>
            </button>
            {/* Mobile expanded filter panel */}
            {showSecondary && (
              <div className="space-y-2 py-1">
                <select
                  value={trackFilter}
                  onChange={e => setTrackFilter(e.target.value)}
                  className="w-full h-9 rounded-lg bg-surface-card border border-zinc-800 text-sm px-2 text-text-secondary focus:outline-none"
                >
                  <option value="">All tracks</option>
                  {allTracks.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                <select
                  value={tagFilter}
                  onChange={e => setTagFilter(e.target.value)}
                  className="w-full h-9 rounded-lg bg-surface-card border border-zinc-800 text-sm px-2 text-text-secondary focus:outline-none"
                >
                  <option value="">All tags</option>
                  {allTagOptions.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                <select
                  value={visaFilter}
                  onChange={e => setVisaFilter(e.target.value as typeof visaFilter)}
                  className="w-full h-9 rounded-lg bg-surface-card border border-zinc-800 text-sm px-2 text-text-secondary focus:outline-none"
                >
                  <option value="proceed">Visa: proceed</option>
                  <option value="kill">Visa: kill</option>
                  <option value="all">Visa: all</option>
                </select>
                <div className="flex items-center gap-2 h-9 bg-zinc-800 border border-zinc-700 rounded px-3 text-sm">
                  <span className="text-zinc-500">From</span>
                  <input
                    type="date"
                    value={fromDate}
                    onChange={e => setFromDate(e.target.value)}
                    className="bg-transparent text-zinc-200 [color-scheme:dark] flex-1"
                  />
                  {fromDate && (
                    <button onClick={() => setFromDate('')} className="text-zinc-500 hover:text-zinc-300">✕</button>
                  )}
                </div>
                <label className="flex items-center gap-2 text-sm text-zinc-400 cursor-pointer h-9 px-1">
                  <input
                    type="checkbox"
                    checked={showHidden}
                    onChange={e => setShowHidden(e.target.checked)}
                    className="w-4 h-4"
                  />
                  Show hidden jobs
                </label>
                {hasActiveSecondary && (
                  <button
                    onClick={() => { setTrackFilter(''); setTagFilter(''); setFromDate(''); setShowHidden(false); setVisaFilter('proceed') }}
                    className="text-xs text-zinc-500 hover:text-zinc-300 px-1"
                  >Clear filters</button>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Setup panel (new users with no folder configured) ──── */}
      {!IS_CLOUD && jobsPathExists === false && jobs.length === 0 && (
        <SetupPanel onComplete={() => { setJobsPathExists(true); reload() }} />
      )}
      {IS_CLOUD && !initialLoading && jobs.length === 0 && (
        <div className="flex-1 flex items-center justify-center p-12">
          <div className="text-center space-y-4 max-w-sm">
            <div className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-indigo-600/20 border border-indigo-600/30 text-xl">
              📋
            </div>
            <div className="space-y-1">
              <p className="text-zinc-300 text-sm font-medium">No jobs yet</p>
              <p className="text-zinc-500 text-xs leading-relaxed">
                Click <strong className="text-zinc-300">Scan</strong> to import jobs.
                In Chrome/Edge, a connected Jobs folder in <strong className="text-zinc-300">Settings</strong> scans automatically; otherwise you can upload <strong className="text-zinc-300">.md</strong> files.
              </p>
            </div>
            <button
              onClick={() => setShowImportGuide(true)}
              className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
            >
              How to clip job listings into .md files →
            </button>
          </div>
        </div>
      )}

      {/* ── Table / Card List ──────────────────────────────────── */}
      {isDesktop ? (
        <div data-tour="jobs-table" className={`px-6 pt-4 pb-6 ${(!IS_CLOUD && jobsPathExists === false && jobs.length === 0) ? 'hidden' : ''}`}>
          {initialLoading ? <JobsTableSkeleton /> : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800">
                <th className="pb-2 pr-3 w-6">
                  <AnimatedCheckbox checked={allVisibleSelected} onChange={toggleAll} label="Select all" />
                </th>
                <SortTh label="Company"  col="company"    sort={sort} onSort={onSort} />
                <SortTh label="Role"     col="role_title" sort={sort} onSort={onSort} />
                <SortTh label="Fit%"     col="fit_pct"    sort={sort} onSort={onSort} className="w-14" />
                <th className="pb-2 pr-4 w-40 text-left text-zinc-500">Action</th>
                <SortTh label="Clipped"  col="clipped_at" sort={sort} onSort={onSort} className="w-20" />
                <th className="pb-2 w-20 text-left text-zinc-500">Resume</th>
                <th className="pb-2 w-6" />
              </tr>
            </thead>
            <tbody>
              {(
                visible.map((job, idx) => {
                  const currentAction = job.action ?? '0-Saved'
                  const rowError      = rowErrors.get(job.id)
                  const clippedIso    = job.clipped_at ?? job.file_mtime
                  const jobTags       = parseTags(job)
                  return (
                    <tr
                      key={job.id}
                      className={`border-b border-zinc-800/60 hover:bg-surface-raised hover:-translate-y-px transition-all duration-100 cursor-pointer group ${job.id === selectedJobId ? 'border-l-2 border-indigo-500 bg-indigo-500/5' : ''} ${job.hidden ? 'opacity-40' : ''}`}
                      onClick={() => setSelectedJobId(job.id)}
                    >
                      {/* Checkbox */}
                      <td className="py-3 pr-3" onClick={e => e.stopPropagation()}>
                        <AnimatedCheckbox
                          checked={selected.has(job.id)}
                          onChange={() => toggleSelect(job.id)}
                          label={`Select ${job.company}`}
                        />
                      </td>

                      {/* Company — visa ⊘ inline */}
                      <td className="py-3 pr-4">
                        <div className="flex items-center gap-1.5">
                          {job.visa_status === 'kill' && (
                            <span className="text-red-500 text-2xs" title="No sponsorship">⊘</span>
                          )}
                          <span className="text-zinc-200">{job.company}</span>
                        </div>
                      </td>

                      {/* Role + track badge + pipeline tag dots */}
                      <td className="py-3 pr-4">
                        <div className="flex items-center gap-2 flex-wrap">
                          {editingTitleId === job.id ? (
                            <input
                              autoFocus
                              value={editingTitleVal}
                              onChange={e => setEditingTitleVal(e.target.value)}
                              onBlur={commitTitleEdit}
                              onKeyDown={e => {
                                if (e.key === 'Enter') { e.preventDefault(); void commitTitleEdit() }
                                if (e.key === 'Escape') setEditingTitleId(null)
                              }}
                              onClick={e => e.stopPropagation()}
                              className="text-zinc-200 bg-zinc-800 border border-indigo-500 rounded px-1.5 py-0.5 text-sm outline-none min-w-0 w-48"
                            />
                          ) : (
                            <span
                              className="text-zinc-300 cursor-text hover:text-zinc-100"
                              title="Double-click to edit title"
                              onDoubleClick={e => startTitleEdit(job.id, job.role_title, e)}
                            >{job.role_title}</span>
                          )}
                          {job.role_track && (
                            <span className="text-2xs px-1.5 py-0.5 bg-zinc-800 border border-zinc-700/80 text-zinc-500 rounded font-mono leading-none">
                              {job.role_track}
                            </span>
                          )}
                          <div className="flex gap-0.5 items-center">
                            {PIPELINE_TAGS.map(tag => {
                              const active = jobTags.includes(tag.key)
                              return (
                                <button
                                  key={tag.key}
                                  title={tag.label}
                                  onClick={e => { e.stopPropagation(); void handleTagToggle(job.id, tag.key) }}
                                  className={`w-2.5 h-2.5 rounded-full transition-all hover:scale-125 cursor-pointer ${
                                    active ? tag.dot : 'bg-zinc-600 opacity-25 hover:opacity-70'
                                  }`}
                                />
                              )
                            })}
                          </div>
                        </div>
                      </td>

                      {/* Fit% */}
                      <td className="py-3 pr-4">
                        <FitBadge pct={job.fit_pct} />
                      </td>

                      {/* Action dropdown */}
                      <td className="py-2 pr-4" onClick={e => e.stopPropagation()}>
                        {rowError ? (
                          <span data-testid="row-action-error" className="text-red-400 text-xs">{rowError}</span>
                        ) : (
                          <select
                            data-tour={idx === 0 ? 'action-cell' : undefined}
                            value={currentAction}
                            onChange={e => void handleActionChange(job.id, e.target.value)}
                            className={`bg-zinc-800 border border-zinc-700 rounded px-1.5 py-0.5 text-xs ${ACTION_COLORS[currentAction] ?? 'text-zinc-400'}`}
                          >
                            {VALID_ACTIONS.map(a => <option key={a} value={a}>{a}</option>)}
                          </select>
                        )}
                      </td>

                      {/* Clipped date — color-coded by staleness */}
                      <td className={`py-3 pr-4 text-xs font-mono ${clipColor(clippedIso)}`}>
                        {fmtDate(clippedIso)}
                      </td>

                      {/* Resume status */}
                      <td className="py-2 pr-4">
                        {genStatus.has(job.id) ? (() => {
                          const st = genStatus.get(job.id)!
                          if (st === 'done') return (
                            <span className="text-xs flex items-center gap-1">
                              <span className="text-green-400">✓</span>
                              <button
                                onClick={e => { e.stopPropagation(); setReasoningJobId(job.id) }}
                                className="text-yellow-400 hover:text-yellow-300"
                              >★</button>
                            </span>
                          )
                          if (st === 'failed') return (
                            <button
                              onClick={e => { e.stopPropagation(); setErrorDetail(genErrors.get(job.id) ?? 'Unknown error') }}
                              className="text-red-400 hover:text-red-300 text-xs"
                              title="Click to view error"
                            >✗ failed</button>
                          )
                          return <span className="text-zinc-400 text-xs">{st}</span>
                        })() : job.has_reasoning ? (
                          <button
                            onClick={e => { e.stopPropagation(); setReasoningJobId(job.id) }}
                            className="text-yellow-400 hover:text-yellow-300 text-xs whitespace-nowrap"
                          >★ Why?</button>
                        ) : job.has_output ? (
                          <span className="text-green-400 text-xs">✓</span>
                        ) : null}
                      </td>

                      {/* Hide */}
                      <td className="py-2" onClick={e => e.stopPropagation()}>
                        <button
                          onClick={() => void hideJob(job.id, job.hidden ? 0 : 1)}
                          className={`opacity-20 group-hover:opacity-100 text-sm leading-none px-1 rounded transition-all duration-150 ${
                            job.hidden
                              ? 'text-zinc-400 hover:text-green-400'
                              : 'text-zinc-400 hover:text-red-400'
                          }`}
                          title={job.hidden ? 'Unhide' : 'Hide'}
                        >
                          {job.hidden ? '↺' : '×'}
                        </button>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
          )}

          {!initialLoading && visible.length === 0 && (
            <p className="text-zinc-500 text-sm text-center py-10">No jobs match current filters.</p>
          )}
        </div>
      ) : (
        <div className={`px-4 pt-3 pb-6 space-y-2 ${(!IS_CLOUD && jobsPathExists === false && jobs.length === 0) ? 'hidden' : ''}`}>
          {initialLoading ? <JobsTableSkeleton /> : (
            <>
              {visible.map(job => (
                <JobCard
                  key={job.id}
                  job={job}
                  selected={selected.has(job.id)}
                  onSelect={() => toggleSelect(job.id)}
                  onOpen={() => setSelectedJobId(job.id)}
                  onActionChange={action => void handleActionChange(job.id, action)}
                  genStatus={genStatus.get(job.id)}
                />
              ))}
              {visible.length === 0 && (
                <p className="text-zinc-500 text-sm text-center py-10">No jobs match current filters.</p>
              )}
            </>
          )}
        </div>
      )}

      {/* ── Modals ─────────────────────────────────────────────── */}
      <AnimatePresence>
        {selectedJobId && (
          <JobDetailModal
            key={selectedJobId}
            jobId={selectedJobId}
            onClose={() => setSelectedJobId(null)}
            onTagsChange={(tags) => {
              setJobs(prev => prev.map(j => j.id === selectedJobId ? { ...j, tags: JSON.stringify(tags) } : j))
            }}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {reasoningJobId && (() => {
          const j = jobs.find(x => x.id === reasoningJobId)
          return j ? (
            <ReasoningModal
              key={reasoningJobId}
              jobId={reasoningJobId}
              company={j.company}
              roleTitle={j.role_title}
              onClose={() => setReasoningJobId(null)}
            />
          ) : null
        })()}
      </AnimatePresence>

      {/* ── Sticky bottom drawer — selection + generation ──────── */}
      {drawerOpen && (
        <div className="fixed bottom-0 left-0 right-0 z-20 bg-surface-card border-t border-zinc-800 shadow-xl shadow-black/40 px-6 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:left-12">
          {!showPanel ? (
            /* Compact selection bar */
            <div className="flex flex-col gap-2">
              {hasAiProvider === false && (
                <div className="flex items-center gap-2 px-3 py-2 bg-yellow-900/40 border border-yellow-700/60 rounded text-xs text-yellow-300">
                  <span>No AI provider configured — add your API key in</span>
                  <a href="/settings" className="underline hover:text-yellow-100 font-medium">Settings</a>
                  <span>before generating.</span>
                </div>
              )}
              <div className="flex items-center gap-3">
                <span className="text-sm text-zinc-300 font-medium">{selected.size} selected</span>
                <button onClick={() => setSelected(new Set())} className="text-xs text-zinc-500 hover:text-zinc-300">
                  Clear
                </button>
                <div className="ml-auto">
                  <button
                    data-tour="generate-btn"
                    onClick={() => void generate()}
                    disabled={selected.size === 0 || hasAiProvider === false}
                    title={hasAiProvider === false ? 'Add an AI provider in Settings first' : undefined}
                    className="text-sm px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 rounded disabled:opacity-40 transition-colors"
                  >
                    {`Generate ${selected.size}`}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            /* Generation panel — AnimatePresence stays mounted so exit animation fires */
            <AnimatePresence>
              {showPanel && (
                <GenerationPanel
                  key="gen-panel"
                  queue={generateQueue}
                  sessionId={activeSessionId}
                  minimized={panelMinimized}
                  onMinimize={() => setPanelMinimized(p => !p)}
                  onClose={() => {
                    setShowPanel(false)
                    setPanelMinimized(false)
                    setGenerateQueue([])
                    setSelected(new Set())
                  }}
                  onStageUpdate={(jobId, stage) =>
                    setGenStatus(prev => new Map(prev).set(jobId, `⟳ ${stage}`))}
                  onDone={jobId => {
                    setGenStatus(prev => new Map(prev).set(jobId, 'done'))
                    reload()
                  }}
                  onError={(jobId, msg) => {
                    const sanitized = msg
                      .replace(/\/api\/[a-zA-Z0-9\-_/[\]?=&]+/g, '[endpoint]')
                      .replace(/https?:\/\/[^\s)]+/g, '[url]')
                    setGenStatus(prev => new Map(prev).set(jobId, 'failed'))
                    setGenErrors(prev => new Map(prev).set(jobId, sanitized))
                  }}
                />
              )}
            </AnimatePresence>
          )}
        </div>
      )}

      {IS_CLOUD && (
        <input
          ref={uploadRef}
          type="file"
          accept=".md"
          aria-label="Upload markdown job files"
          multiple
          className="hidden"
          onChange={e => {
            void scanUploadedFiles(e.target.files)
            e.currentTarget.value = ''
          }}
        />
      )}

      {showImportGuide && <JobImportGuide onClose={() => setShowImportGuide(false)} />}
      {showPasteModal && (
        <PasteJobModal
          onClose={() => setShowPasteModal(false)}
          onAdded={() => reload()}
        />
      )}

      {/* Error detail overlay — shown when user clicks ✗ failed in the job row */}
      {errorDetail && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center pb-6 px-4"
          onClick={() => setErrorDetail(null)}
        >
          <div
            className="bg-zinc-900 border border-red-800 rounded-lg p-4 w-full max-w-2xl shadow-2xl shadow-black/60"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-red-400 text-sm font-semibold">Generation Error</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => void navigator.clipboard.writeText(errorDetail)}
                  className="text-xs text-zinc-400 hover:text-zinc-200 px-2 py-0.5 border border-zinc-700 hover:border-zinc-500 rounded"
                >Copy</button>
                <button
                  onClick={() => setErrorDetail(null)}
                  className="text-zinc-500 hover:text-zinc-300 text-sm leading-none"
                >✕</button>
              </div>
            </div>
            <pre className="text-red-300 text-xs whitespace-pre-wrap break-words select-all overflow-auto max-h-64 font-mono">
              {errorDetail}
            </pre>
          </div>
        </div>
      )}
    </div>
  )
}

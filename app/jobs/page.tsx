'use client'
import { useState, useEffect, useMemo, useCallback } from 'react'
import { extractAllTags } from '@/lib/tag-filter'
import { AnimatedCheckbox } from '@/components/AnimatedCheckbox'
import JobDetailModal from '@/components/JobDetailModal'
import GenerationPanel from '@/components/GenerationPanel'
import SessionSwitcher from '@/components/SessionSwitcher'
import { VALID_ACTIONS } from '@/lib/actions'
import ReasoningModal from '@/components/ReasoningModal'
import { SetupPanel } from '@/components/SetupPanel'
import { useSession } from '@/contexts/SessionContext'
import { AnimatePresence } from 'framer-motion'

const ACTION_COLORS: Record<string, string> = {
  '0-Saved':        'text-zinc-400',
  '1-Applied':      'text-cyan-400',
  '2-Phone Screen': 'text-indigo-400',
  '3-Interview':    'text-purple-400',
  '4-Offer':        'text-green-400',
  '5-Rejected':     'text-red-400',
  '6-Ghosted':      'text-zinc-500',
}

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

// Color clipped date by staleness — encodes the 3-day apply window
function clipColor(iso: string | null): string {
  if (!iso) return 'text-zinc-600'
  const days = (Date.now() - new Date(iso).getTime()) / 86_400_000
  if (days <= 3) return 'text-green-400'
  if (days <= 7) return 'text-amber-400'
  return 'text-zinc-500'
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`
}

function FitBadge({ pct }: { pct: number }) {
  if (pct >= 80) return (
    <span className="rounded-full px-2 py-0.5 text-xs font-medium bg-green-500/10 text-green-400">{pct}%</span>
  )
  if (pct >= 60) return (
    <span className="rounded-full px-2 py-0.5 text-xs font-medium bg-amber-500/10 text-amber-400">{pct}%</span>
  )
  return (
    <span className="rounded-full px-2 py-0.5 text-xs font-medium bg-zinc-800 text-zinc-500">{pct}%</span>
  )
}

export default function JobsPage() {
  const { activeSessionId } = useSession()
  const [jobs, setJobs]         = useState<Job[]>([])
  const [scanStatus, setScanStatus] = useState('')
  const [rowErrors, setRowErrors]   = useState<Map<string, string>>(new Map())
  const [showSecondary, setShowSecondary] = useState(false)

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
  const [showPanel, setShowPanel]         = useState(false)
  const [panelMinimized, setPanelMinimized] = useState(false)
  const [generateQueue, setGenerateQueue] = useState<string[]>([])

  const [sort, setSort] = useState<{ col: SortCol; dir: SortDir }>({ col: 'clipped_at', dir: 'desc' })
  const [jobsPathExists, setJobsPathExists] = useState<boolean | null>(null)

  // Debounced q for search — fires reload 300ms after typing stops
  const [debouncedQ, setDebouncedQ] = useState('')
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 300)
    return () => clearTimeout(t)
  }, [q])

  const reload = useCallback(() => {
    const p = new URLSearchParams()
    if (debouncedQ)              p.set('q',        debouncedQ)
    if (showHidden)              p.set('showHidden','1')
    if (fitMin > 0)              p.set('fitMin',   String(fitMin))
    if (trackFilter)             p.set('track',    trackFilter)
    if (visaFilter !== 'proceed') p.set('visa',    visaFilter)
    if (actionFilter)            p.set('action',   actionFilter)
    if (tagFilter)               p.set('tag',      tagFilter)
    if (fromDate)                p.set('fromDate', fromDate)
    fetch(`/api/jobs?${p}`).then(r => r.ok ? r.json() : []).then(setJobs)
  }, [debouncedQ, showHidden, fitMin, trackFilter, visaFilter, actionFilter, tagFilter, fromDate])

  useEffect(() => {
    reload()
    fetch('/api/settings')
      .then(r => r.ok ? r.json() : null)
      .then((d: Record<string, unknown> | null) => {
        setJobsPathExists(d ? Boolean(d.jobs_path_exists) : true)
      })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Re-fetch whenever any filter changes (debouncedQ handles the search delay)
  useEffect(() => { reload() }, [reload])

  const tracks  = useMemo(() => Array.from(new Set(jobs.map(j => j.role_track).filter(Boolean))).sort(), [jobs])
  const allTags = useMemo(() => extractAllTags(jobs), [jobs])

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

  const visible = useMemo(() => {
    return [...jobs].sort((a, b) => {
      let va: string | number = (a as unknown as Record<string, string | number>)[sort.col] ?? ''
      let vb: string | number = (b as unknown as Record<string, string | number>)[sort.col] ?? ''
      if (sort.col === 'fit_pct') { va = a.fit_pct; vb = b.fit_pct }
      const cmp = typeof va === 'number' && typeof vb === 'number'
        ? va - vb : String(va).localeCompare(String(vb))
      return sort.dir === 'asc' ? cmp : -cmp
    })
  }, [jobs, sort])

  const allVisibleSelected = visible.length > 0 && visible.every(j => selected.has(j.id))
  const toggleAll = () => setSelected(allVisibleSelected ? new Set() : new Set(visible.map(j => j.id)))

  const scan = async () => {
    setScanStatus('Scanning…')
    const res  = await fetch('/api/batch/scan', { method: 'POST' })
    const data = await res.json()
    setScanStatus(res.ok ? `↑ ${data.scanned} new` : `✗ ${data.error ?? 'scan failed'}`)
    if (res.ok) reload()
    setTimeout(() => setScanStatus(''), 4000)
  }

  const hasActiveSecondary = !!(trackFilter || tagFilter || fromDate || showHidden || visaFilter !== 'proceed')
  const drawerOpen = selected.size > 0 || showPanel

  return (
    <div className={`flex flex-col min-h-full ${drawerOpen ? 'pb-20' : ''}`}>

      {/* ── Sticky header ──────────────────────────────────────── */}
      <div className="sticky top-0 z-10 bg-surface-base border-b border-zinc-800 px-6 pt-4 pb-3 space-y-2.5">

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
          <div className="shrink-0 flex items-center gap-1.5 h-8 bg-surface-card border border-zinc-800 rounded-lg px-2.5 text-sm focus-within:border-indigo-500 transition-colors duration-100">
            <span className="text-text-muted">Fit ≥</span>
            <input
              type="number" min={0} max={100} step={10}
              value={fitMin}
              onChange={e => setFitMin(Number(e.target.value))}
              className="w-10 bg-transparent text-zinc-200 text-center"
            />
            <span className="text-text-muted">%</span>
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
              {tracks.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <select
              value={tagFilter}
              onChange={e => setTagFilter(e.target.value)}
              className="h-8 rounded-lg bg-surface-card border border-zinc-800 text-sm px-2 text-text-secondary focus:outline-none focus:border-indigo-500 transition-colors duration-100"
            >
              <option value="">All tags</option>
              {allTags.map(t => <option key={t} value={t}>{t}</option>)}
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

      {/* ── Setup panel (new users with no folder configured) ──── */}
      {jobsPathExists === false && jobs.length === 0 && (
        <SetupPanel onComplete={() => { setJobsPathExists(true); reload() }} />
      )}

      {/* ── Table ──────────────────────────────────────────────── */}
      <div data-tour="jobs-table" className={`px-6 pt-4 pb-6 ${jobsPathExists === false && jobs.length === 0 ? 'hidden' : ''}`}>
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
            {visible.map((job, idx) => {
              const currentAction = job.action ?? '0-Saved'
              const rowError      = rowErrors.get(job.id)
              const clippedIso    = job.clipped_at ?? job.file_mtime
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
                        <span className="text-red-500 text-[10px]" title="No sponsorship">⊘</span>
                      )}
                      <span className="text-zinc-200">{job.company}</span>
                    </div>
                  </td>

                  {/* Role + track badge */}
                  <td className="py-3 pr-4">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-zinc-300">{job.role_title}</span>
                      {job.role_track && (
                        <span className="text-[10px] px-1.5 py-0.5 bg-zinc-800 border border-zinc-700/80 text-zinc-500 rounded font-mono leading-none">
                          {job.role_track}
                        </span>
                      )}
                    </div>
                  </td>

                  {/* Fit% */}
                  <td className="py-3 pr-4">
                    <FitBadge pct={job.fit_pct} />
                  </td>

                  {/* Action dropdown */}
                  <td className="py-2 pr-4" onClick={e => e.stopPropagation()}>
                    {rowError ? (
                      <span className="text-red-400 text-xs">{rowError}</span>
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
                    {genStatus.has(job.id) ? (
                      <span className="text-zinc-400 text-xs">
                        {genStatus.get(job.id)}
                        {genStatus.get(job.id) === 'done' && (
                          <button
                            onClick={e => { e.stopPropagation(); setReasoningJobId(job.id) }}
                            className="ml-1 text-yellow-400 hover:text-yellow-300"
                          >★</button>
                        )}
                      </span>
                    ) : job.has_reasoning ? (
                      <button
                        onClick={e => { e.stopPropagation(); setReasoningJobId(job.id) }}
                        className="text-yellow-400 hover:text-yellow-300 text-xs whitespace-nowrap"
                      >★ Why?</button>
                    ) : job.has_output ? (
                      <span className="text-zinc-500 text-xs">doc</span>
                    ) : null}
                  </td>

                  {/* Hide */}
                  <td className="py-2" onClick={e => e.stopPropagation()}>
                    <button
                      onClick={() => void hideJob(job.id, job.hidden ? 0 : 1)}
                      className="opacity-0 group-hover:opacity-100 text-zinc-600 hover:text-zinc-300 text-xs px-1 transition-opacity"
                      title={job.hidden ? 'Unhide' : 'Hide'}
                    >
                      {job.hidden ? '↺' : '✕'}
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>

        {visible.length === 0 && (
          <p className="text-zinc-500 text-sm text-center py-10">No jobs match current filters.</p>
        )}
      </div>

      {/* ── Modals ─────────────────────────────────────────────── */}
      <AnimatePresence>
        {selectedJobId && (
          <JobDetailModal key={selectedJobId} jobId={selectedJobId} onClose={() => setSelectedJobId(null)} />
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
        <div className="fixed bottom-0 left-12 right-0 z-20 bg-surface-card border-t border-zinc-800 shadow-xl shadow-black/40 px-6 py-3">
          {!showPanel ? (
            /* Compact selection bar */
            <div className="flex items-center gap-3">
              <span className="text-sm text-zinc-300 font-medium">{selected.size} selected</span>
              <button onClick={() => setSelected(new Set())} className="text-xs text-zinc-500 hover:text-zinc-300">
                Clear
              </button>
              <div className="ml-auto">
                <button
                  data-tour="generate-btn"
                  onClick={() => void generate()}
                  disabled={selected.size === 0}
                  className="text-sm px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 rounded disabled:opacity-40 transition-colors"
                >
                  {`Generate ${selected.size}`}
                </button>
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
                  onError={(jobId, msg) =>
                    setGenStatus(prev => new Map(prev).set(jobId, `✗ ${msg.slice(0, 20)}`))
                  }
                />
              )}
            </AnimatePresence>
          )}
        </div>
      )}
    </div>
  )
}

'use client'
import { useState, useEffect, useMemo, useCallback } from 'react'
import { extractAllTags, jobMatchesTagFilter, parseTags } from '@/lib/tag-filter'
import JobDetailModal from '@/components/JobDetailModal'
import GenerationPanel from '@/components/GenerationPanel'
import { VALID_ACTIONS } from '@/lib/actions'
import ReasoningModal from '@/components/ReasoningModal'

const ACTION_COLORS: Record<string, string> = {
  '0-Saved':       'text-zinc-400',
  '1-Applied':     'text-cyan-400',
  '2-Phone Screen':'text-indigo-400',
  '3-Interview':   'text-purple-400',
  '4-Offer':       'text-green-400',
  '5-Rejected':    'text-red-400',
  '6-Ghosted':     'text-zinc-500',
}

interface Job {
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
  has_reasoning: number  // SQLite returns 0 or 1
  has_output: number     // SQLite returns 0 or 1
}

type SortCol = 'company' | 'role_title' | 'role_track' | 'fit_pct' | 'action' | 'file_mtime' | 'scanned_at'
type SortDir = 'asc' | 'desc'

const NUM_COLS: SortCol[] = ['fit_pct', 'file_mtime', 'scanned_at']

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
        {label} {active ? (sort.dir === 'asc' ? '↑' : '↓') : ''}
      </span>
    </th>
  )
}

export default function JobsPage() {
  const [jobs, setJobs] = useState<Job[]>([])
  const [scanStatus, setScanStatus] = useState('')
  const [rowErrors, setRowErrors] = useState<Map<string, string>>(new Map())

  // Filter state
  const [q, setQ] = useState('')
  const [trackFilter, setTrackFilter] = useState('')
  const [fitMin, setFitMin] = useState(0)
  const [visaFilter, setVisaFilter] = useState<'all' | 'proceed' | 'kill'>('proceed')
  const [actionFilter, setActionFilter] = useState('')
  const [tagFilter, setTagFilter] = useState('')

  const [selectedJobId, setSelectedJobId] = useState<string | null>(null)
  const [reasoningJobId, setReasoningJobId] = useState<string | null>(null)

  // Generation state
  const [selected, setSelected]           = useState<Set<string>>(new Set())
  const [genStatus, setGenStatus]         = useState<Map<string, string>>(new Map())
  const [generating, setGenerating]       = useState(false)
  const [showPanel, setShowPanel]         = useState(false)
  const [generateQueue, setGenerateQueue] = useState<string[]>([])

  // Sort state — default: newest file first
  const [sort, setSort] = useState<{ col: SortCol; dir: SortDir }>({ col: 'file_mtime', dir: 'desc' })

  const reload = (search = '') => {
    const url = search ? `/api/jobs?q=${encodeURIComponent(search)}` : '/api/jobs'
    fetch(url).then(r => r.ok ? r.json() : []).then(setJobs)
  }

  useEffect(() => { reload() }, [])

  useEffect(() => {
    const timer = setTimeout(() => reload(q), 300)
    return () => clearTimeout(timer)
  }, [q])

  const tracks = useMemo(() =>
    Array.from(new Set(jobs.map(j => j.role_track).filter(Boolean))).sort(),
    [jobs]
  )

  const allTags = useMemo(() => extractAllTags(jobs), [jobs])

  const onSort = (col: SortCol) => {
    setSort(prev =>
      prev.col === col
        ? { col, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : { col, dir: NUM_COLS.includes(col) ? 'desc' : 'asc' }
    )
  }

  const toggleSelect = (id: string) =>
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  const generate = async () => {
    const ids = Array.from(selected)
    if (ids.length === 0) return
    setGenerating(true)
    const res = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobIds: ids }),
    })
    if (!res.ok) { setGenerating(false); return }
    setGenerateQueue(ids)
    setShowPanel(true)
  }

  const setRowError = useCallback((id: string, msg: string) => {
    setRowErrors(prev => new Map(prev).set(id, msg))
    setTimeout(() => setRowErrors(prev => {
      const next = new Map(prev)
      next.delete(id)
      return next
    }), 3000)
  }, [])

  const handleActionChange = useCallback(async (jobId: string, newAction: string) => {
    // Optimistic update
    setJobs(prev => prev.map(j => j.id === jobId ? { ...j, action: newAction } : j))

    const res = await fetch(`/api/jobs/${jobId}/action`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: newAction }),
    })

    if (!res.ok) {
      // Revert
      reload()
      const data = await res.json().catch(() => ({})) as { error?: string }
      setRowError(jobId, data.error ?? 'Save failed')
    }
  }, [setRowError])

  const visible = useMemo(() => {
    let list = jobs.filter(j => {
      const tags = parseTags(j)

      if (actionFilter && (j.action ?? '0-Saved') !== actionFilter) return false
      if (!jobMatchesTagFilter(j, tagFilter)) return false
      if (visaFilter === 'proceed' && j.visa_status === 'kill') return false
      if (visaFilter === 'kill' && j.visa_status !== 'kill') return false
      if (trackFilter && j.role_track !== trackFilter) return false
      if (j.fit_pct < fitMin) return false
      return true
    })

    list = [...list].sort((a, b) => {
      let va: string | number = a[sort.col] ?? ''
      let vb: string | number = b[sort.col] ?? ''
      if (sort.col === 'fit_pct') { va = a.fit_pct; vb = b.fit_pct }
      const cmp = typeof va === 'number' && typeof vb === 'number'
        ? va - vb
        : String(va).localeCompare(String(vb))
      return sort.dir === 'asc' ? cmp : -cmp
    })

    return list
  }, [jobs, trackFilter, tagFilter, fitMin, visaFilter, actionFilter, sort])

  const allVisibleSelected = visible.length > 0 && visible.every(j => selected.has(j.id))

  const toggleAll = () =>
    setSelected(allVisibleSelected ? new Set() : new Set(visible.map(j => j.id)))

  const scan = async () => {
    setScanStatus('Scanning…')
    const res = await fetch('/api/batch/scan', { method: 'POST' })
    const data = await res.json()
    if (res.ok) {
      setScanStatus(`Scanned ${data.scanned} files`)
      reload(q)
    } else {
      setScanStatus(`Error: ${data.error ?? 'scan failed'}`)
    }
    setTimeout(() => setScanStatus(''), 4000)
  }

  const fmtDate = (iso: string | null) => {
    if (!iso) return '—'
    const d = new Date(iso)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-semibold">Jobs</h1>
        <span className="text-sm text-zinc-500">{visible.length} shown</span>
        <button onClick={scan} className="ml-auto text-sm px-3 py-1 bg-zinc-700 hover:bg-zinc-600 rounded">
          Scan
        </button>
        <button
          onClick={() => void generate()}
          disabled={selected.size === 0 || generating}
          className="text-sm px-3 py-1 bg-indigo-600 hover:bg-indigo-500 rounded disabled:opacity-40"
        >
          {generating ? 'Generating…' : `Generate${selected.size > 0 ? ` ${selected.size}` : ''} selected`}
        </button>
        {scanStatus && (
          <span className={`text-sm ${scanStatus.startsWith('Error') ? 'text-red-400' : 'text-green-400'}`}>
            {scanStatus}
          </span>
        )}
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap gap-2">
        <input
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Search company, role, track, body…"
          className="flex-1 min-w-48 bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-sm"
        />

        <select
          value={trackFilter}
          onChange={e => setTrackFilter(e.target.value)}
          className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm text-zinc-300"
        >
          <option value="">All tracks</option>
          {tracks.map(t => <option key={t} value={t}>{t}</option>)}
        </select>

        <select
          value={tagFilter}
          onChange={e => setTagFilter(e.target.value)}
          className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm text-zinc-300"
        >
          <option value="">All tags</option>
          {allTags.map(t => <option key={t} value={t}>{t}</option>)}
        </select>

        <div className="flex items-center gap-1.5 bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm">
          <span className="text-zinc-500">Fit ≥</span>
          <input
            type="number" min={0} max={100} step={10}
            value={fitMin}
            onChange={e => setFitMin(Number(e.target.value))}
            className="w-12 bg-transparent text-zinc-200 text-center"
          />
          <span className="text-zinc-500">%</span>
        </div>

        <select
          value={visaFilter}
          onChange={e => setVisaFilter(e.target.value as typeof visaFilter)}
          className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm text-zinc-300"
        >
          <option value="proceed">Visa: proceed</option>
          <option value="kill">Visa: kill</option>
          <option value="all">Visa: all</option>
        </select>

        <select
          value={actionFilter}
          onChange={e => setActionFilter(e.target.value)}
          className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm text-zinc-300"
        >
          <option value="">All stages</option>
          {VALID_ACTIONS.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
      </div>

      {/* Generation panel */}
      {showPanel && generateQueue.length > 0 && (
        <GenerationPanel
          queue={generateQueue}
          onStageUpdate={(jobId, stage) =>
            setGenStatus(prev => new Map(prev).set(jobId, `⟳ ${stage}`))
          }
          onDone={(jobId) => {
            setGenStatus(prev => new Map(prev).set(jobId, 'done'))
            setGenerating(false)
            reload(q)
          }}
          onError={(jobId, msg) => {
            setGenStatus(prev => new Map(prev).set(jobId, `✗ ${msg.slice(0, 20)}`))
            setGenerating(false)
          }}
        />
      )}

      {/* Table */}
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-zinc-700">
            <th className="pb-2 pr-3 w-6">
              <input
                type="checkbox"
                checked={allVisibleSelected}
                onChange={toggleAll}
                className="accent-indigo-500"
              />
            </th>
            <SortTh label="Company"  col="company"    sort={sort} onSort={onSort} />
            <SortTh label="Role"     col="role_title" sort={sort} onSort={onSort} />
            <SortTh label="Track"    col="role_track" sort={sort} onSort={onSort} />
            <SortTh label="Fit%"     col="fit_pct"    sort={sort} onSort={onSort} className="w-16" />
            <SortTh label="Action"   col="action"     sort={sort} onSort={onSort} className="w-40" />
            <SortTh label="Clipped"  col="file_mtime" sort={sort} onSort={onSort} className="w-28" />
            <SortTh label="Scanned"  col="scanned_at" sort={sort} onSort={onSort} className="w-28" />
            <th className="pb-2 w-16 text-left text-zinc-500">Visa</th>
            <th className="pb-2 w-24 text-left text-zinc-500">Status</th>
          </tr>
        </thead>
        <tbody>
          {visible.map(job => {
            const currentAction = job.action ?? '0-Saved'
            const rowError = rowErrors.get(job.id)
            return (
              <tr
                key={job.id}
                className="border-b border-zinc-800 hover:bg-zinc-800/40 cursor-pointer"
                onClick={() => setSelectedJobId(job.id)}
              >
                <td className="py-2 pr-3" onClick={e => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={selected.has(job.id)}
                    onChange={() => toggleSelect(job.id)}
                    className="accent-indigo-500"
                  />
                </td>
                <td className="py-2 pr-4 text-zinc-200">{job.company}</td>
                <td className="py-2 pr-4 text-zinc-300">{job.role_title}</td>
                <td className="py-2 pr-4 text-zinc-400 text-xs">{job.role_track}</td>
                <td className="py-2 pr-4">
                  <span className={job.fit_pct >= 60 ? 'text-green-400' : 'text-zinc-400'}>{job.fit_pct}%</span>
                </td>
                <td className="py-2 pr-4" onClick={e => e.stopPropagation()}>
                  {rowError
                    ? <span className="text-red-400 text-xs">{rowError}</span>
                    : (
                      <select
                        value={currentAction}
                        onChange={e => handleActionChange(job.id, e.target.value)}
                        className={`bg-zinc-800 border border-zinc-700 rounded px-1.5 py-0.5 text-xs ${ACTION_COLORS[currentAction] ?? 'text-zinc-400'}`}
                      >
                        {VALID_ACTIONS.map(a => (
                          <option key={a} value={a}>{a}</option>
                        ))}
                      </select>
                    )
                  }
                </td>
                <td className="py-2 pr-4 text-zinc-500 text-xs">{fmtDate(job.file_mtime)}</td>
                <td className="py-2 pr-4 text-zinc-500 text-xs">{fmtDate(job.scanned_at)}</td>
                <td className="py-2">
                  <span className={job.visa_status === 'kill' ? 'text-red-400' : 'text-green-400'}>{job.visa_status}</span>
                </td>
                <td className="py-1.5 pr-4 whitespace-nowrap">
                  {genStatus.has(job.id) ? (
                    <span className="text-zinc-400 text-xs">
                      {genStatus.get(job.id)}
                      {genStatus.get(job.id) === 'done' && (
                        <button
                          onClick={e => { e.stopPropagation(); setReasoningJobId(job.id) }}
                          className="ml-1 text-yellow-400 hover:text-yellow-300"
                          title="AI reasoning"
                        >★ Why?</button>
                      )}
                    </span>
                  ) : job.has_reasoning ? (
                    <button
                      onClick={e => { e.stopPropagation(); setReasoningJobId(job.id) }}
                      className="text-yellow-400 hover:text-yellow-300 text-xs"
                      title="AI reasoning"
                    >★</button>
                  ) : job.has_output ? (
                    <span className="text-zinc-400 text-xs" title="Resume generated">doc</span>
                  ) : null}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>

      {visible.length === 0 && (
        <p className="text-zinc-500 text-sm text-center py-8">No jobs match current filters.</p>
      )}

      {selectedJobId && (
        <JobDetailModal jobId={selectedJobId} onClose={() => setSelectedJobId(null)} />
      )}

      {reasoningJobId && (() => {
        const j = jobs.find(x => x.id === reasoningJobId)
        return j ? (
          <ReasoningModal
            jobId={reasoningJobId}
            company={j.company}
            roleTitle={j.role_title}
            onClose={() => setReasoningJobId(null)}
          />
        ) : null
      })()}
    </div>
  )
}

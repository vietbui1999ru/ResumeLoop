'use client'
import { useState, useEffect, useMemo } from 'react'

interface Job {
  id: string
  company: string
  role_title: string
  role_track: string
  fit_pct: number
  visa_status: string
  tags: string
  file_mtime: string | null
  scanned_at: string | null
}

type SortCol = 'company' | 'role_title' | 'role_track' | 'fit_pct' | 'file_mtime' | 'scanned_at'
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

  // Filter state
  const [q, setQ] = useState('')
  const [trackFilter, setTrackFilter] = useState('')
  const [fitMin, setFitMin] = useState(0)
  const [visaFilter, setVisaFilter] = useState<'all' | 'proceed' | 'kill'>('proceed')
  const [showMode, setShowMode] = useState<'pending' | 'all'>('pending')

  // Sort state — default: newest file first
  const [sort, setSort] = useState<{ col: SortCol; dir: SortDir }>({ col: 'file_mtime', dir: 'desc' })

  const reload = () =>
    fetch('/api/jobs').then(r => r.ok ? r.json() : []).then(setJobs)

  useEffect(() => { reload() }, [])

  const tracks = useMemo(() =>
    Array.from(new Set(jobs.map(j => j.role_track).filter(Boolean))).sort(),
    [jobs]
  )

  const onSort = (col: SortCol) => {
    setSort(prev =>
      prev.col === col
        ? { col, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : { col, dir: NUM_COLS.includes(col) ? 'desc' : 'asc' }
    )
  }

  const visible = useMemo(() => {
    let list = jobs.filter(j => {
      const tags: string[] = JSON.parse(j.tags ?? '[]')

      if (showMode === 'pending' && !tags.includes('un-resume')) return false
      if (visaFilter === 'proceed' && j.visa_status === 'kill') return false
      if (visaFilter === 'kill' && j.visa_status !== 'kill') return false
      if (trackFilter && j.role_track !== trackFilter) return false
      if (j.fit_pct < fitMin) return false

      if (q) {
        const lq = q.toLowerCase()
        const hit =
          j.company.toLowerCase().includes(lq) ||
          j.role_title.toLowerCase().includes(lq) ||
          (j.role_track ?? '').toLowerCase().includes(lq)
        if (!hit) return false
      }
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
  }, [jobs, q, trackFilter, fitMin, visaFilter, showMode, sort])

  const scan = async () => {
    setScanStatus('Scanning…')
    const res = await fetch('/api/batch/scan', { method: 'POST' })
    const data = await res.json()
    if (res.ok) {
      setScanStatus(`Scanned ${data.scanned} files`)
      reload()
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
          placeholder="Search company, role, track…"
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
          value={showMode}
          onChange={e => setShowMode(e.target.value as typeof showMode)}
          className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm text-zinc-300"
        >
          <option value="pending">Pending only</option>
          <option value="all">All jobs</option>
        </select>
      </div>

      {/* Table */}
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-zinc-700">
            <SortTh label="Company"  col="company"    sort={sort} onSort={onSort} />
            <SortTh label="Role"     col="role_title" sort={sort} onSort={onSort} />
            <SortTh label="Track"    col="role_track" sort={sort} onSort={onSort} />
            <SortTh label="Fit%"     col="fit_pct"    sort={sort} onSort={onSort} className="w-16" />
            <SortTh label="Clipped"  col="file_mtime" sort={sort} onSort={onSort} className="w-28" />
            <SortTh label="Scanned"  col="scanned_at" sort={sort} onSort={onSort} className="w-28" />
            <th className="pb-2 w-16 text-left text-zinc-500">Visa</th>
          </tr>
        </thead>
        <tbody>
          {visible.map(job => (
            <tr key={job.id} className="border-b border-zinc-800 hover:bg-zinc-800/40">
              <td className="py-2 pr-4 text-zinc-200">{job.company}</td>
              <td className="py-2 pr-4 text-zinc-300">{job.role_title}</td>
              <td className="py-2 pr-4 text-zinc-400 text-xs">{job.role_track}</td>
              <td className="py-2 pr-4">
                <span className={job.fit_pct >= 60 ? 'text-green-400' : 'text-zinc-400'}>{job.fit_pct}%</span>
              </td>
              <td className="py-2 pr-4 text-zinc-500 text-xs">{fmtDate(job.file_mtime)}</td>
              <td className="py-2 pr-4 text-zinc-500 text-xs">{fmtDate(job.scanned_at)}</td>
              <td className="py-2">
                <span className={job.visa_status === 'kill' ? 'text-red-400' : 'text-green-400'}>{job.visa_status}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {visible.length === 0 && (
        <p className="text-zinc-500 text-sm text-center py-8">No jobs match current filters.</p>
      )}
    </div>
  )
}

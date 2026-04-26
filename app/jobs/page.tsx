'use client'
import { useState, useEffect } from 'react'

interface Job {
  id: string; company: string; role_title: string
  role_track: string; fit_pct: number; visa_status: string; tags: string
}
interface BatchEvent { job_id: string | null; status: string; message: string }

export default function JobsPage() {
  const [jobs, setJobs] = useState<Job[]>([])
  const [filter, setFilter] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [log, setLog] = useState<BatchEvent[]>([])
  const [running, setRunning] = useState(false)

  const reload = () =>
    fetch('/api/jobs').then(r => r.ok ? r.json() : []).then(setJobs)

  useEffect(() => { reload() }, [])

  const pending = jobs.filter(j => {
    const tags: string[] = JSON.parse(j.tags ?? '[]')
    const q = filter.toLowerCase()
    const matchesFilter = !q
      || j.company.toLowerCase().includes(q)
      || j.role_title.toLowerCase().includes(q)
      || (j.role_track ?? '').toLowerCase().includes(q)
    return tags.includes('un-resume') && j.visa_status !== 'kill' && matchesFilter
  })

  const toggle = (id: string) =>
    setSelected(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })

  const scan = async () => {
    await fetch('/api/batch/scan', { method: 'POST' })
    reload()
  }

  const runBatch = async () => {
    if (!selected.size) return
    setRunning(true); setLog([])
    const res = await fetch('/api/batch/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ job_ids: [...selected] }),
    })
    const reader = res.body!.getReader()
    const dec = new TextDecoder()
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      for (const line of dec.decode(value).split('\n')) {
        if (line.startsWith('data: ')) {
          try { setLog(p => [...p, JSON.parse(line.slice(6))]) } catch {}
        }
      }
    }
    setRunning(false); setSelected(new Set()); reload()
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-semibold">Jobs</h1>
        <span className="text-sm text-zinc-500">{pending.length} pending</span>
        <button onClick={scan} className="ml-auto text-sm px-3 py-1 bg-zinc-700 hover:bg-zinc-600 rounded">Scan</button>
        <button
          onClick={runBatch}
          disabled={!selected.size || running}
          className="text-sm px-3 py-1 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 rounded"
        >
          {running ? 'Running…' : `Build ${selected.size || ''} selected`}
        </button>
      </div>

      <input
        value={filter}
        onChange={e => setFilter(e.target.value)}
        placeholder="Filter by company, role, or track…"
        className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm"
      />

      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-zinc-500 border-b border-zinc-700">
            <th className="pb-2 pr-2 w-8"></th>
            <th className="pb-2 pr-4">Company</th>
            <th className="pb-2 pr-4">Role</th>
            <th className="pb-2 pr-4">Track</th>
            <th className="pb-2 pr-4">Fit%</th>
            <th className="pb-2">Visa</th>
          </tr>
        </thead>
        <tbody>
          {pending.map(job => (
            <tr key={job.id} className="border-b border-zinc-800 hover:bg-zinc-800/40">
              <td className="py-2 pr-2">
                <input type="checkbox" checked={selected.has(job.id)} onChange={() => toggle(job.id)} className="accent-indigo-500" />
              </td>
              <td className="py-2 pr-4 text-zinc-200">{job.company}</td>
              <td className="py-2 pr-4 text-zinc-300">{job.role_title}</td>
              <td className="py-2 pr-4 text-zinc-400 text-xs">{job.role_track}</td>
              <td className="py-2 pr-4">
                <span className={job.fit_pct >= 60 ? 'text-green-400' : 'text-zinc-400'}>{job.fit_pct}%</span>
              </td>
              <td className="py-2">
                <span className={job.visa_status === 'kill' ? 'text-red-400' : 'text-green-400'}>{job.visa_status}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {log.length > 0 && (
        <div className="bg-zinc-900 border border-zinc-700 rounded p-3 font-mono text-xs space-y-1">
          {log.map((e, i) => (
            <div key={i} className={e.status === 'error' ? 'text-red-400' : e.status === 'done' ? 'text-green-400' : 'text-zinc-300'}>
              {e.message}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

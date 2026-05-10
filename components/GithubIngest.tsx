'use client'
import { useState } from 'react'
import { useSession } from '@/contexts/SessionContext'

interface ProjectEntry {
  id: string
  name: string
  summary: string
  short_stack: string
  bullets: string[]
}

type State = 'idle' | 'loading' | 'preview' | 'applied'

export default function GithubIngest() {
  const { activeSessionId } = useSession()
  const [url, setUrl] = useState('')
  const [state, setState] = useState<State>('idle')
  const [entry, setEntry] = useState<ProjectEntry | null>(null)
  const [bullets, setBullets] = useState<string[]>([])
  const [projectId, setProjectId] = useState('')
  const [error, setError] = useState('')

  const fetchRepo = async () => {
    if (!url.trim()) return
    setState('loading')
    setError('')
    try {
      const res = await fetch('/api/github/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim() }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Fetch failed'); setState('idle'); return }
      setEntry(data as ProjectEntry)
      setBullets(data.bullets)
      setProjectId(data.id)
      setState('preview')
    } catch (e) {
      setError(String(e))
      setState('idle')
    }
  }

  const apply = async () => {
    if (!entry) return
    try {
      const res = await fetch('/api/github/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project: { ...entry, id: projectId, bullets }, sessionId: activeSessionId }),
      })
      if (res.ok) setState('applied')
      else setError('Failed to write to profile')
    } catch (e) {
      setError(String(e))
    }
  }

  const charClass = (s: string) => s.length > 116 ? 'text-red-400' : 'text-zinc-300'

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
      <h2 className="text-base font-semibold text-zinc-100">Import from GitHub</h2>

      <div className="flex gap-2">
        <input
          value={url}
          onChange={e => setUrl(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') fetchRepo() }}
          placeholder="https://github.com/user/repo"
          disabled={state === 'loading'}
          className="flex-1 bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 disabled:opacity-50"
        />
        <button
          onClick={fetchRepo}
          disabled={state === 'loading' || !url.trim()}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm rounded disabled:opacity-50"
        >{state === 'loading' ? 'Fetching...' : 'Fetch'}</button>
      </div>

      {error && <p className="text-red-400 text-sm">{error}</p>}

      {state === 'preview' && entry && (
        <div className="space-y-3">
          <div className="bg-zinc-900 rounded border border-zinc-700 px-4 py-3">
            <p className="text-sm font-semibold text-zinc-100">{entry.name} — <span className="font-normal text-zinc-400">{entry.short_stack}</span></p>
            <p className="text-xs text-zinc-500 mt-1">{entry.summary}</p>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-xs text-zinc-500">Project ID:</label>
            <input
              value={projectId}
              onChange={e => setProjectId(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''))}
              className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs font-mono text-zinc-300 w-40 focus:outline-none"
            />
          </div>

          <div className="space-y-2">
            <p className="text-xs text-zinc-500">Bullets (edit before adding):</p>
            {bullets.map((b, i) => (
              <div key={i} className="flex items-start gap-2">
                <span className="text-zinc-600 text-xs mt-2 w-3 flex-shrink-0">•</span>
                <div className="flex-1">
                  <textarea
                    value={b}
                    onChange={e => setBullets(prev => prev.map((x, j) => j === i ? e.target.value : x))}
                    rows={2}
                    className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-sm resize-none focus:outline-none focus:border-indigo-500"
                  />
                  <span className={`text-xs ${charClass(b)}`}>{b.length}/116</span>
                </div>
              </div>
            ))}
          </div>

          <button
            onClick={apply}
            className="px-4 py-2 bg-green-700 hover:bg-green-600 text-white text-sm rounded"
          >Add to Profile</button>
        </div>
      )}

      {state === 'applied' && (
        <p className="text-green-400 text-sm">Added to profile — go to Chat to continue editing.</p>
      )}
    </div>
  )
}

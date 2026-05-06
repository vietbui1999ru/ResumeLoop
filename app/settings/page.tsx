'use client'
import { useState, useEffect, useCallback } from 'react'

interface FsInfo {
  path: string
  parent: string
  dirs: string[]
  md_count: number
  docx_count: number
  error?: string
}

interface Settings {
  jobs_path: string
  output_path: string
  jobs_path_exists: boolean
  output_path_exists: boolean
}

function FolderPicker({
  label, value, hint, onChange,
}: {
  label: string
  value: string
  hint: string
  onChange: (p: string) => void
}) {
  const [browsePath, setBrowsePath] = useState(value)
  const [fs, setFs] = useState<FsInfo | null>(null)
  const [browsing, setBrowsing] = useState(false)
  const [creating, setCreating] = useState(false)
  const [status, setStatus] = useState('')

  const browse = useCallback(async (p: string) => {
    setBrowsePath(p)
    const res = await fetch(`/api/fs?path=${encodeURIComponent(p)}`)
    const data = await res.json()
    if (res.ok) setFs(data)
    else setFs({ ...data, dirs: [], md_count: 0, docx_count: 0 })
  }, [])

  const create = async () => {
    setCreating(true)
    const res = await fetch('/api/fs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: browsePath }),
    })
    const data = await res.json()
    if (res.ok) { setStatus('Created ✓'); browse(data.path); onChange(data.path) }
    else setStatus(`Error: ${data.error}`)
    setCreating(false)
  }

  const select = () => {
    onChange(browsePath)
    setBrowsing(false)
    setStatus('Saved ✓')
    setTimeout(() => setStatus(''), 2000)
  }

  useEffect(() => { setBrowsePath(value) }, [value])

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 space-y-3">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-zinc-200">{label}</p>
          <p className="text-xs text-zinc-500 mt-0.5">{hint}</p>
        </div>
        {status && <span className="text-xs text-green-400 shrink-0">{status}</span>}
      </div>

      {/* Current value display */}
      <div className="flex gap-2">
        <code className="flex-1 text-xs bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-zinc-300 truncate">
          {value || '—'}
        </code>
        <button
          onClick={() => { setBrowsing(b => !b); if (!browsing) browse(value || '/') }}
          className="text-xs px-3 py-2 bg-zinc-700 hover:bg-zinc-600 rounded"
        >
          {browsing ? 'Close' : 'Browse'}
        </button>
      </div>

      {/* Browser panel */}
      {browsing && (
        <div className="border border-zinc-700 rounded-lg overflow-hidden">
          {/* Path input + nav */}
          <div className="flex gap-1 p-2 bg-zinc-800 border-b border-zinc-700">
            <input
              value={browsePath}
              onChange={e => setBrowsePath(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && browse(browsePath)}
              className="flex-1 text-xs bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-zinc-200 font-mono"
            />
            <button onClick={() => browse(browsePath)} className="text-xs px-2 py-1 bg-zinc-700 hover:bg-zinc-600 rounded">Go</button>
            {fs?.parent && fs.parent !== fs.path && (
              <button onClick={() => browse(fs.parent)} className="text-xs px-2 py-1 bg-zinc-700 hover:bg-zinc-600 rounded">↑ Up</button>
            )}
          </div>

          {/* Directory listing */}
          <div className="max-h-48 overflow-y-auto">
            {fs?.error && (
              <p className="text-xs text-red-400 px-3 py-2">{fs.error}</p>
            )}
            {!fs?.error && fs?.dirs.length === 0 && (
              <p className="text-xs text-zinc-500 px-3 py-3">No subdirectories</p>
            )}
            {fs?.dirs.map(d => (
              <button
                key={d}
                onClick={() => browse(`${fs.path}/${d}`)}
                className="w-full text-left text-xs px-3 py-1.5 hover:bg-zinc-700 text-zinc-300 font-mono border-b border-zinc-800 last:border-0"
              >
                📁 {d}
              </button>
            ))}
          </div>

          {/* Footer stats + actions */}
          <div className="flex items-center justify-between gap-2 p-2 bg-zinc-800 border-t border-zinc-700">
            <span className="text-xs text-zinc-500">
              {fs && !fs.error
                ? `${fs.md_count} .md · ${fs.docx_count} .docx`
                : ''}
            </span>
            <div className="flex gap-1">
              <button
                onClick={create}
                disabled={creating}
                className="text-xs px-2 py-1 bg-zinc-600 hover:bg-zinc-500 rounded disabled:opacity-40"
              >
                {creating ? 'Creating…' : '+ Create folder'}
              </button>
              <button
                onClick={select}
                disabled={!!fs?.error}
                className="text-xs px-2 py-1 bg-indigo-600 hover:bg-indigo-500 rounded disabled:opacity-40"
              >
                Use this folder
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useState('')

  useEffect(() => {
    fetch('/api/settings').then(r => r.json()).then(setSettings)
  }, [])

  const save = async (patch: Partial<Pick<Settings, 'jobs_path' | 'output_path'>>) => {
    if (!settings) return
    const next = { ...settings, ...patch }
    setSettings(next)
    setSaving(true)
    const res = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    })
    if (res.ok) {
      const { settings: updated } = await res.json()
      setSettings(s => s ? { ...s, ...updated } : s)
      setSaveStatus('Saved')
    } else {
      setSaveStatus('Error')
    }
    setSaving(false)
    setTimeout(() => setSaveStatus(''), 2000)
  }

  if (!settings) return <div className="text-zinc-500 text-sm">Loading…</div>

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Settings</h1>
        {(saving || saveStatus) && (
          <span className={`text-sm ${saveStatus === 'Error' ? 'text-red-400' : 'text-green-400'}`}>
            {saving ? 'Saving…' : saveStatus}
          </span>
        )}
      </div>

      <div className="space-y-3">
        <h2 className="text-xs font-semibold text-zinc-500 uppercase">Folder Paths</h2>

        <FolderPicker
          label="Job Postings Folder"
          hint="Folder containing .md job description files. Used by Scan."
          value={settings.jobs_path}
          onChange={p => save({ jobs_path: p })}
        />

        <FolderPicker
          label="Resume Output Folder"
          hint="Where generated .docx resume files are saved."
          value={settings.output_path}
          onChange={p => save({ output_path: p })}
        />
      </div>

      <div className="space-y-2">
        <h2 className="text-xs font-semibold text-zinc-500 uppercase">Status</h2>
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-zinc-400">Jobs folder</span>
            <span className={settings.jobs_path_exists ? 'text-green-400' : 'text-red-400'}>
              {settings.jobs_path_exists ? '✓ found' : '✗ not found'}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-zinc-400">Output folder</span>
            <span className={settings.output_path_exists ? 'text-green-400' : 'text-amber-400'}>
              {settings.output_path_exists ? '✓ found' : '⚠ will be created on first build'}
            </span>
          </div>
        </div>
      </div>

      <p className="text-xs text-zinc-600">
        Paths are stored in the database and override <code>.env.local</code> values.
        In Docker, use container-side paths (e.g. <code>/jobs</code>, <code>/output</code>).
      </p>
    </div>
  )
}

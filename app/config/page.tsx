'use client'
import { useState, useEffect } from 'react'

type FileKey =
  | 'buildv2.js'
  | 'master_resume_data.json'
  | 'ats-optimized-resume-system.md'
  | 'ats-optimization-guidelines.md'
  | 'CLAUDE-full.md'
  | 'spec-job-match-resume-generator.md'

function ConfigEditor({ file }: { file: FileKey }) {
  const [content, setContent] = useState('')
  const [status, setStatus] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/config/read?file=${file}`)
      .then(r => r.json())
      .then(d => { setContent(d.content ?? ''); setLoading(false) })
  }, [file])

  const save = async () => {
    setStatus('Saving…')
    const res = await fetch('/api/config/write', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file, content }),
    })
    const d = await res.json()
    setStatus(res.ok ? `Saved (backup: ${d.backup})` : `Error: ${d.error}`)
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-zinc-400 font-mono">{file}</h2>
        <div className="flex items-center gap-3">
          {status && <span className="text-xs text-zinc-500">{status}</span>}
          <button onClick={save} className="text-sm px-3 py-1 bg-indigo-600 hover:bg-indigo-500 rounded">Save</button>
        </div>
      </div>
      <textarea
        value={loading ? 'Loading…' : content}
        onChange={e => setContent(e.target.value)}
        disabled={loading}
        className="w-full h-96 bg-zinc-900 border border-zinc-700 rounded px-3 py-2 font-mono text-xs text-zinc-300 focus:outline-none focus:border-indigo-500 resize-y"
        spellCheck={false}
      />
    </div>
  )
}

export default function ConfigPage() {
  return (
    <div className="space-y-8 p-6">
      <div>
        <h1 className="text-xl font-semibold">Config</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Edit pipeline files. A <code>.bak</code> backup is created before every save. JSON and JS syntax validated before writing.
        </p>
      </div>
      <ConfigEditor file="master_resume_data.json" />
      <ConfigEditor file="buildv2.js" />
      <div>
        <h2 className="text-sm font-semibold text-zinc-400 mb-4">Reference Docs</h2>
        <p className="text-xs text-zinc-600 mb-4">
          These files are injected into every AI reasoning call. Edit to tune resume generation behavior.
        </p>
        <div className="space-y-8">
          <ConfigEditor file="ats-optimization-guidelines.md" />
          <ConfigEditor file="CLAUDE-full.md" />
          <ConfigEditor file="ats-optimized-resume-system.md" />
          <ConfigEditor file="spec-job-match-resume-generator.md" />
        </div>
      </div>
    </div>
  )
}

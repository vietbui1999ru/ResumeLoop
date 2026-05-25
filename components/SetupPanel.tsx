'use client'
import { useState, useCallback, useEffect } from 'react'
import { useTourContext } from '@/contexts/TourContext'
import { JobImportGuide } from '@/components/JobImportGuide'
import { type Provider, PROVIDER_LABELS, PROVIDERS } from '@/lib/provider-config'

interface FsInfo {
  path: string
  parent: string
  dirs: string[]
  md_count: number
  docx_count: number
  error?: string
}

// ── Minimal folder picker ────────────────────────────────────────────────────
function MiniPicker({
  label, hint, value, onChange,
}: {
  label: string
  hint: string
  value: string
  onChange: (p: string) => void
}) {
  const [browsePath, setBrowsePath] = useState(value || '/')
  const [fs, setFs] = useState<FsInfo | null>(null)
  const [open, setOpen] = useState(false)
  const [creating, setCreating] = useState(false)

  const browse = useCallback(async (p: string) => {
    setBrowsePath(p)
    try {
      const res = await fetch(`/api/fs?path=${encodeURIComponent(p)}`)
      const data = await res.json() as FsInfo
      if (res.ok) setFs(data)
      else setFs({ ...data, dirs: [], md_count: 0, docx_count: 0 })
    } catch { /* ignore */ }
  }, [])

  const create = async () => {
    setCreating(true)
    try {
      const res = await fetch('/api/fs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: browsePath }),
      })
      const data = await res.json() as FsInfo
      if (res.ok) { browse(data.path); onChange(data.path) }
    } catch { /* ignore */ } finally {
      setCreating(false)
    }
  }

  const select = () => { onChange(browsePath); setOpen(false) }

  const configured = Boolean(value)

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <div className={`w-4 h-4 rounded-full flex items-center justify-center text-2xs shrink-0 ${
          configured ? 'bg-green-500 text-white' : 'bg-surface-overlay text-text-secondary'
        }`}>
          {configured ? '✓' : '○'}
        </div>
        <div>
          <p className="text-sm font-medium text-text-primary">{label}</p>
          <p className="text-xs text-text-muted">{hint}</p>
        </div>
      </div>

      <div className="ml-6 flex gap-2">
        <code className="flex-1 text-xs bg-surface-raised border border-border-default rounded px-3 py-2 text-text-secondary truncate min-w-0">
          {value || '—'}
        </code>
        <button
          onClick={() => { setOpen(o => !o); if (!open) browse(value || '/') }}
          className="text-xs px-3 py-2 bg-surface-overlay hover:bg-surface-overlay rounded shrink-0 transition-colors"
        >
          {open ? 'Close' : 'Browse'}
        </button>
      </div>

      {open && (
        <div className="ml-6 border border-border-default rounded-lg overflow-hidden">
          <div className="flex gap-1 p-2 bg-surface-raised border-b border-border-default">
            <input
              value={browsePath}
              onChange={e => setBrowsePath(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && browse(browsePath)}
              className="flex-1 text-xs bg-surface-base border border-border-default rounded px-2 py-1 text-text-primary font-mono"
            />
            <button onClick={() => browse(browsePath)} className="text-xs px-2 py-1 bg-surface-overlay hover:bg-surface-overlay rounded">Go</button>
            {fs?.parent && fs.parent !== fs.path && (
              <button onClick={() => browse(fs.parent)} className="text-xs px-2 py-1 bg-surface-overlay hover:bg-surface-overlay rounded">↑</button>
            )}
          </div>

          <div className="max-h-40 overflow-y-auto">
            {fs?.error && <p className="text-xs text-red-400 px-3 py-2">{fs.error}</p>}
            {!fs?.error && fs?.dirs.length === 0 && (
              <p className="text-xs text-text-muted px-3 py-3">No subdirectories</p>
            )}
            {fs?.dirs.map(d => (
              <button
                key={d}
                onClick={() => browse(`${fs.path}/${d}`)}
                className="w-full text-left text-xs px-3 py-1.5 hover:bg-surface-overlay text-text-secondary font-mono border-b border-border-subtle last:border-0"
              >
                📁 {d}
              </button>
            ))}
          </div>

          <div className="flex items-center justify-between gap-2 p-2 bg-surface-raised border-t border-border-default">
            <span className="text-xs text-text-muted">
              {fs && !fs.error ? `${fs.md_count} .md · ${fs.docx_count} .docx` : ''}
            </span>
            <div className="flex gap-1">
              <button
                onClick={create}
                disabled={creating}
                className="text-xs px-2 py-1 bg-surface-overlay hover:bg-surface-overlay rounded disabled:opacity-40"
              >
                {creating ? 'Creating…' : '+ Create'}
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

// ── Main SetupPanel ──────────────────────────────────────────────────────────
export function SetupPanel({ onComplete }: { onComplete: () => void }) {
  // Tour auto-activates on /jobs navigation via TourContext's derived activeStep
  useTourContext()

  const [jobsPath, setJobsPath]   = useState('')
  const [outputPath, setOutputPath] = useState('')
  const [provider, setProvider]   = useState<Provider>('anthropic')
  const [apiKey, setApiKey]       = useState('')
  const [aiError, setAiError]     = useState('')
  const [saving, setSaving]       = useState(false)
  const [showImportGuide, setShowImportGuide] = useState(false)

  // Load existing paths so the picker shows current values
  useEffect(() => {
    const ac = new AbortController()
    fetch('/api/settings', { signal: ac.signal })
      .then(r => r.ok ? r.json() as Promise<Record<string, unknown>> : null)
      .then((d: Record<string, unknown> | null) => {
        if (!d) return
        if (typeof d.jobs_path === 'string')   setJobsPath(d.jobs_path)
        if (typeof d.output_path === 'string') setOutputPath(d.output_path)
      })
      .catch(() => {})
    return () => ac.abort()
  }, [])

  const saveFolder = async (patch: { jobs_path?: string; output_path?: string }) => {
    try {
      await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
    } catch { /* ignore */ }
  }

  const allConfigured = Boolean(jobsPath && outputPath && (provider === 'ollama' || apiKey))

  const launch = async () => {
    if (!allConfigured) return
    setSaving(true)
    setAiError('')

    try {
      // Save AI provider
      if (provider !== 'ollama') {
        const res = await fetch('/api/settings/ai', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ provider, api_key: apiKey, set_active: true }),
        })
        if (!res.ok) {
          const d = await res.json() as { error?: string }
          setAiError(d.error ?? 'AI key test failed')
          setSaving(false)
          return
        }
      } else {
        await fetch('/api/settings/ai', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ provider: 'ollama' }),
        })
      }

      // Trigger scan
      await fetch('/api/batch/scan', { method: 'POST' })

      onComplete()
    } catch (e) {
      setAiError(String(e))
      setSaving(false)
    }
  }

  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="w-full max-w-lg">
        {/* Header */}
        <div className="mb-8 text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-indigo-600/20 border border-indigo-600/40 mb-4">
            <span className="text-2xl">⚡</span>
          </div>
          <h2 className="text-xl font-semibold text-text-primary">Set up ResumeLoop</h2>
          <p className="text-sm text-text-secondary mt-1">Three things and you&apos;re scanning jobs.</p>
        </div>

        {/* Import guide callout */}
        <div className="mb-4 flex items-center justify-between bg-surface-card/60 border border-border-subtle rounded-xl px-4 py-3">
          <div>
            <p className="text-xs font-medium text-text-secondary">Don&apos;t have .md job files yet?</p>
            <p className="text-xs text-text-muted">Use Obsidian Web Clipper to save jobs from any listing page</p>
          </div>
          <button
            onClick={() => setShowImportGuide(true)}
            className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors whitespace-nowrap ml-4"
          >
            How to →
          </button>
        </div>

        {/* Steps */}
        <div className="space-y-6">

          {/* Step 1 — Jobs folder */}
          <div className="bg-surface-card border border-border-subtle rounded-xl p-5 space-y-3">
            <p className="text-xs font-semibold text-text-muted uppercase tracking-wide">Step 1</p>
            <MiniPicker
              label="Job Postings Folder"
              hint="Folder containing your .md job description files"
              value={jobsPath}
              onChange={p => { setJobsPath(p); saveFolder({ jobs_path: p }) }}
            />
          </div>

          {/* Step 2 — Output folder */}
          <div className="bg-surface-card border border-border-subtle rounded-xl p-5 space-y-3">
            <p className="text-xs font-semibold text-text-muted uppercase tracking-wide">Step 2</p>
            <MiniPicker
              label="Output Folder"
              hint="Where generated DOCX resumes will be saved"
              value={outputPath}
              onChange={p => { setOutputPath(p); saveFolder({ output_path: p }) }}
            />
          </div>

          {/* Step 3 — AI provider */}
          <div className="bg-surface-card border border-border-subtle rounded-xl p-5 space-y-3">
            <p className="text-xs font-semibold text-text-muted uppercase tracking-wide">Step 3</p>

            <div className="flex items-center gap-2">
              <div className={`w-4 h-4 rounded-full flex items-center justify-center text-2xs shrink-0 ${
                (provider === 'ollama' || apiKey) ? 'bg-green-500 text-white' : 'bg-surface-overlay text-text-secondary'
              }`}>
                {(provider === 'ollama' || apiKey) ? '✓' : '○'}
              </div>
              <div>
                <p className="text-sm font-medium text-text-primary">AI Provider</p>
                <p className="text-xs text-text-muted">Used for resume generation and fit scoring</p>
              </div>
            </div>

            <div className="ml-6 space-y-2">
              <select
                value={provider}
                onChange={e => { setProvider(e.target.value as Provider); setApiKey(''); setAiError('') }}
                className="w-full text-xs bg-surface-raised border border-border-default rounded px-3 py-2 text-text-primary"
              >
                {PROVIDERS.map(p => (
                  <option key={p} value={p}>{PROVIDER_LABELS[p]}</option>
                ))}
              </select>

              {provider !== 'ollama' && (
                <input
                  type="password"
                  value={apiKey}
                  onChange={e => { setApiKey(e.target.value); setAiError('') }}
                  placeholder="Paste API key…"
                  className="w-full text-xs bg-surface-raised border border-border-default rounded px-3 py-2 text-text-primary font-mono placeholder:text-text-secondary"
                />
              )}
              {provider === 'ollama' && (
                <p className="text-xs text-text-muted">Ollama runs locally — no key needed. Make sure it&apos;s running on port 11434.</p>
              )}
              {aiError && <p className="text-xs text-red-400">{aiError}</p>}
            </div>
          </div>
        </div>

        {/* CTA */}
        <div className="mt-6">
          <button
            onClick={launch}
            disabled={!allConfigured || saving}
            className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-sm font-semibold transition-colors"
          >
            {saving ? 'Saving…' : 'Scan now →'}
          </button>
          {!allConfigured && (
            <p className="text-center text-xs text-text-secondary mt-2">Complete all three steps above to continue</p>
          )}
        </div>
      </div>

      {showImportGuide && <JobImportGuide onClose={() => setShowImportGuide(false)} />}
    </div>
  )
}

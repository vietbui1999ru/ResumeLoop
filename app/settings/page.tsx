'use client'
import { useState, useEffect, useCallback } from 'react'
import { signOut } from 'next-auth/react'

// ── AI Provider types ────────────────────────────────────────────────────────
type Provider = 'anthropic' | 'openai' | 'google' | 'groq' | 'openrouter' | 'ollama'

interface ProviderHint {
  provider:  Provider
  model:     string
  key_hint:  string
  base_url?: string
  is_active: boolean
}

interface AISettings {
  active_provider: Provider | null
  providers:       Provider[]
  default_models:  Record<Provider, string>
  configs:         ProviderHint[]
}

const PROVIDER_LABELS: Record<Provider, string> = {
  anthropic:  'Anthropic (Claude)',
  openai:     'OpenAI (GPT)',
  google:     'Google (Gemini)',
  groq:       'Groq (Llama / Mixtral)',
  openrouter: 'OpenRouter (all providers)',
  ollama:     'Ollama (local)',
}

function AIProviderSection() {
  const [ai, setAi]         = useState<AISettings | null>(null)
  const [provider, setProvider] = useState<Provider>('anthropic')
  const [apiKey, setApiKey] = useState('')
  const [model, setModel]   = useState('')
  const [baseUrl, setBaseUrl] = useState('http://localhost:11434/v1')
  const [setActive, setSetActive] = useState(true)
  const [status, setStatus] = useState('')
  const [saving, setSaving] = useState(false)
  const [ollamaModels, setOllamaModels] = useState<string[]>([])
  const [fetchingModels, setFetchingModels] = useState(false)
  const [fetchModelsErr, setFetchModelsErr] = useState('')

  const load = useCallback(() => {
    fetch('/api/settings/ai').then(r => r.json()).then((d: AISettings) => {
      setAi(d)
      setModel(d.default_models[provider] ?? '')
    })
  }, [provider])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    if (ai) setModel(ai.default_models[provider] ?? '')
  }, [provider, ai])

  const save = async () => {
    setSaving(true); setStatus('')
    const body: Record<string, unknown> = { provider, model, set_active: setActive }
    if (provider !== 'ollama') body.api_key = apiKey
    if (provider === 'ollama') body.base_url = baseUrl
    const res = await fetch('/api/settings/ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await res.json()
    if (res.ok) { setStatus('Saved'); setApiKey(''); load() }
    else setStatus(`Error: ${data.error}`)
    setSaving(false)
    setTimeout(() => setStatus(''), 4000)
  }

  const activate = async (p: Provider) => {
    await fetch('/api/settings/ai', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider: p }),
    })
    load()
  }

  const remove = async (p: Provider) => {
    await fetch(`/api/settings/ai?provider=${p}`, { method: 'DELETE' })
    load()
  }

  const fetchOllamaModels = async () => {
    setFetchingModels(true)
    setFetchModelsErr('')
    setOllamaModels([])
    const res = await fetch(`/api/settings/ai/ollama-models?base_url=${encodeURIComponent(baseUrl)}`)
    const data = await res.json() as { models?: string[]; error?: string }
    if (res.ok && data.models) {
      setOllamaModels(data.models)
      if (data.models.length > 0 && !data.models.includes(model)) setModel(data.models[0])
    } else {
      setFetchModelsErr(data.error ?? 'Failed to fetch models')
    }
    setFetchingModels(false)
  }

  if (!ai) return <div className="text-zinc-500 text-sm">Loading…</div>

  return (
    <div className="space-y-4">
      {/* Configured providers list */}
      {ai.configs.length > 0 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
          {ai.configs.map(cfg => (
            <div key={cfg.provider} className="flex items-center gap-3 px-4 py-3 border-b border-zinc-800 last:border-0">
              <div className="flex-1 min-w-0">
                <p className="text-sm text-zinc-200 font-medium">
                  {PROVIDER_LABELS[cfg.provider]}
                  {cfg.is_active && <span className="ml-2 text-xs bg-indigo-600 text-white px-1.5 py-0.5 rounded">active</span>}
                </p>
                <p className="text-xs text-zinc-500 font-mono mt-0.5 truncate">{cfg.key_hint || cfg.base_url || '(no key)'} · {cfg.model}</p>
              </div>
              <div className="flex gap-1 shrink-0">
                {!cfg.is_active && (
                  <button onClick={() => activate(cfg.provider)} className="text-xs px-2 py-1 bg-zinc-700 hover:bg-zinc-600 rounded">
                    Set active
                  </button>
                )}
                <button onClick={() => remove(cfg.provider)} className="text-xs px-2 py-1 bg-red-900 hover:bg-red-800 text-red-300 rounded">
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add / update provider form */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 space-y-3">
        <p className="text-sm font-medium text-zinc-200">Add / update provider</p>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-zinc-500 block mb-1">Provider</label>
            <select
              value={provider}
              onChange={e => setProvider(e.target.value as Provider)}
              className="w-full text-sm bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-zinc-200"
            >
              {ai.providers.map(p => (
                <option key={p} value={p}>{PROVIDER_LABELS[p]}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-zinc-500 block mb-1">Model</label>
            <input
              value={model}
              onChange={e => setModel(e.target.value)}
              className="w-full text-sm bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-zinc-200 font-mono"
              placeholder={ai.default_models[provider]}
            />
          </div>
        </div>

        {provider === 'ollama' ? (
          <div className="space-y-2">
            <div>
              <label className="text-xs text-zinc-500 block mb-1">Base URL</label>
              <div className="flex gap-2">
                <input
                  value={baseUrl}
                  onChange={e => { setBaseUrl(e.target.value); setOllamaModels([]) }}
                  className="flex-1 text-sm bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-zinc-200 font-mono"
                />
                <button
                  type="button"
                  onClick={fetchOllamaModels}
                  disabled={fetchingModels}
                  className="text-xs px-3 py-2 bg-zinc-700 hover:bg-zinc-600 rounded disabled:opacity-40 shrink-0"
                >
                  {fetchingModels ? 'Fetching…' : 'Fetch models'}
                </button>
              </div>
              {fetchModelsErr && <p className="text-xs text-red-400 mt-1">{fetchModelsErr}</p>}
            </div>
            {ollamaModels.length > 0 && (
              <div>
                <label className="text-xs text-zinc-500 block mb-1">Available models</label>
                <select
                  value={model}
                  onChange={e => setModel(e.target.value)}
                  className="w-full text-sm bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-zinc-200 font-mono"
                >
                  {ollamaModels.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
            )}
          </div>
        ) : (
          <div>
            <label className="text-xs text-zinc-500 block mb-1">API Key</label>
            <input
              type="password"
              value={apiKey}
              onChange={e => setApiKey(e.target.value)}
              placeholder={`Enter ${PROVIDER_LABELS[provider]} key…`}
              className="w-full text-sm bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-zinc-200 font-mono"
            />
          </div>
        )}

        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 text-xs text-zinc-400 cursor-pointer">
            <input type="checkbox" checked={setActive} onChange={e => setSetActive(e.target.checked)} className="accent-indigo-500" />
            Set as active provider
          </label>
          <div className="flex items-center gap-3">
            {status && (
              <span className={`text-xs ${status.startsWith('Error') ? 'text-red-400' : 'text-green-400'}`}>{status}</span>
            )}
            <button
              onClick={save}
              disabled={saving || (provider !== 'ollama' && !apiKey)}
              className="text-sm px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded disabled:opacity-40"
            >
              {saving ? 'Testing & saving…' : 'Test & Save'}
            </button>
          </div>
        </div>
      </div>

      <p className="text-xs text-zinc-600">
        Keys are AES-256 encrypted at rest. The full key is never returned by the API after saving.
        Chat currently requires Anthropic as active provider.
      </p>
    </div>
  )
}

interface FsInfo {
  path: string
  parent: string
  dirs: string[]
  md_count: number
  docx_count: number
  error?: string
}

interface Settings {
  jobs_path:            string
  output_path:          string
  outreach_path:        string
  jobs_path_exists:     boolean
  output_path_exists:   boolean
  outreach_path_exists: boolean
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

  const save = async (patch: Partial<Pick<Settings, 'jobs_path' | 'output_path' | 'outreach_path'>>) => {
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
    <div className="space-y-6 max-w-2xl mx-auto p-6">
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

        <div data-tour="jobs-folder">
          <FolderPicker
            label="Job Postings Folder"
            hint="Folder containing .md job description files. Used by Scan."
            value={settings.jobs_path}
            onChange={p => save({ jobs_path: p })}
          />
        </div>

        <FolderPicker
          label="Resume Output Folder"
          hint="Where generated .docx resume files are saved."
          value={settings.output_path}
          onChange={p => save({ output_path: p })}
        />

        <FolderPicker
          label="Outreach Folder"
          hint="Optional — folder of networking/contact .md files (Obsidian clippings). The outreach picker in each job modal defaults here."
          value={settings.outreach_path}
          onChange={p => save({ outreach_path: p })}
        />
      </div>

      <div data-tour="ai-settings" className="space-y-3">
        <h2 className="text-xs font-semibold text-zinc-500 uppercase">AI Provider</h2>
        <AIProviderSection />
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
          {settings.outreach_path && (
            <div className="flex justify-between">
              <span className="text-zinc-400">Outreach folder</span>
              <span className={settings.outreach_path_exists ? 'text-green-400' : 'text-red-400'}>
                {settings.outreach_path_exists ? '✓ found' : '✗ not found'}
              </span>
            </div>
          )}
        </div>
      </div>

      <p className="text-xs text-zinc-600">
        Paths are stored in the database and override <code>.env.local</code> values.
        In Docker, use container-side paths (e.g. <code>/jobs</code>, <code>/output</code>).
      </p>

      <div className="pt-4 border-t border-zinc-800">
        <button
          onClick={() => signOut({ callbackUrl: '/auth/signin' })}
          className="text-sm px-4 py-2 bg-zinc-800 hover:bg-red-900/40 border border-zinc-700 hover:border-red-700/50 text-zinc-400 hover:text-red-400 rounded transition-colors"
        >
          Sign out
        </button>
      </div>
    </div>
  )
}

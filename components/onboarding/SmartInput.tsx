'use client'
import { useState } from 'react'

export type DetectedType = 'github' | 'url' | 'paste' | null

export function detectInputType(input: string): DetectedType {
  const t = input.trim()
  if (!t) return null
  if (t.startsWith('http://') || t.startsWith('https://')) {
    try {
      const url = new URL(t)
      return url.hostname === 'github.com' ? 'github' : 'url'
    } catch { return 'url' }
  }
  // Bare GitHub username: 1-39 chars, letters/digits/hyphens, no consecutive hyphens
  if (/^[a-zA-Z0-9]([a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?$/.test(t)) return 'github'
  return 'paste'
}

const LABEL: Record<Exclude<DetectedType, null>, string> = {
  github: 'Extract GitHub profile',
  url:    'Scrape this page',
  paste:  'Extract from text',
}

const ENDPOINT: Record<Exclude<DetectedType, null>, string> = {
  github: '/api/ingest/github',
  url:    '/api/ingest/url',
  paste:  '/api/ingest/paste',
}

const PAYLOAD_KEY: Record<Exclude<DetectedType, null>, string> = {
  github: 'input',
  url:    'url',
  paste:  'text',
}

export function SmartInput({ onSourceAdded }: { onSourceAdded: (source: unknown) => void }) {
  const [value,   setValue]   = useState('')
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState<string | null>(null)

  const detected = detectInputType(value)

  const handleSubmit = async () => {
    if (!detected) return
    setLoading(true); setError(null)
    try {
      const res  = await fetch(ENDPOINT[detected], {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body:   JSON.stringify({ [PAYLOAD_KEY[detected]]: value.trim() }),
      })
      const data = await res.json() as { source?: unknown; error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Extraction failed')
      onSourceAdded(data.source)
      setValue('')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-2">
      <textarea
        value={value}
        onChange={e => { setValue(e.target.value); setError(null) }}
        placeholder="Paste a URL, GitHub profile (github.com/username or just username), or any text — LinkedIn About, bio, resume…"
        className="w-full h-28 bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-sm text-zinc-200 placeholder-zinc-500 resize-none focus:outline-none focus:ring-1 focus:ring-indigo-500"
        disabled={loading}
      />
      {detected && (
        <div className="flex items-center gap-3">
          <span className="text-xs text-zinc-400">
            Detected: <span className="text-indigo-400 font-medium">{detected}</span>
          </span>
          <button
            onClick={handleSubmit} disabled={loading}
            className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm rounded-md transition-colors"
          >
            {loading ? 'Extracting…' : LABEL[detected]}
          </button>
        </div>
      )}
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  )
}

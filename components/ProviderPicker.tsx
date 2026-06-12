'use client'

import { useEffect, useState, useCallback } from 'react'
import { Check, Circle, Loader2, Terminal, Globe } from 'lucide-react'

interface ProviderStatus {
  id: string
  label: string
  transport: 'spawn' | 'http'
  installed: boolean
  active: boolean
}

/**
 * Local-first provider picker. Lists every brain in the registry, shows which
 * are installed/reachable, and persists the active selection via /api/providers.
 * Decoupled from the cloud AI-key settings (those go away in the local-first model).
 */
export function ProviderPicker() {
  const [providers, setProviders] = useState<ProviderStatus[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/providers')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setProviders((await res.json()).providers)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  async function select(id: string) {
    setBusy(id)
    setError(null)
    try {
      const res = await fetch('/api/providers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ providerId: id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`)
      setProviders(data.providers)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  if (loading) return <p className="text-sm text-neutral-500">Detecting providers…</p>

  return (
    <div className="space-y-2" data-testid="provider-picker">
      {error && (
        <p className="text-sm text-red-600" role="alert">{error}</p>
      )}
      {providers.map(p => (
        <button
          key={p.id}
          type="button"
          data-testid={`provider-${p.id}`}
          disabled={!p.installed || busy !== null}
          aria-pressed={p.active}
          onClick={() => select(p.id)}
          className={[
            'flex w-full items-center gap-3 rounded-lg border px-4 py-3 text-left transition',
            p.active
              ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/30'
              : 'border-neutral-200 dark:border-neutral-800 hover:border-neutral-400',
            !p.installed && 'opacity-50 cursor-not-allowed',
          ].filter(Boolean).join(' ')}
        >
          <span className="text-neutral-500">
            {p.transport === 'http' ? <Globe size={16} /> : <Terminal size={16} />}
          </span>
          <span className="flex-1">
            <span className="font-medium">{p.label}</span>
            <span className="ml-2 text-xs text-neutral-500">
              {p.transport === 'http' ? 'HTTP' : 'CLI'}
              {!p.installed && ' · not detected'}
            </span>
          </span>
          {busy === p.id
            ? <Loader2 size={16} className="animate-spin text-blue-500" />
            : p.active
              ? <Check size={16} className="text-blue-600" data-testid={`active-${p.id}`} />
              : <Circle size={16} className="text-neutral-300" />}
        </button>
      ))}
    </div>
  )
}

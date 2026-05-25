'use client'
import { useState } from 'react'

interface Props {
  file: string
  description: string
  diff: string
  sessionId: string
  onApplied: (accepted: boolean) => void
}

export default function ChatDiff({ file, description, diff, sessionId, onApplied }: Props) {
  const [state, setState] = useState<'pending' | 'accepted' | 'rejected'>('pending')
  const [busy, setBusy] = useState(false)

  const apply = async (accept: boolean) => {
    setBusy(true)
    try {
      const res = await fetch('/api/chat/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, accept, file }),
      })
      if (!res.ok) return
      setState(accept ? 'accepted' : 'rejected')
      onApplied(accept)
    } catch { /* ignore */ } finally {
      setBusy(false)
    }
  }

  const lines = diff.split('\n')

  return (
    <div className="rounded border border-border-default bg-surface-card my-2 overflow-hidden">
      <div className="px-3 py-2 border-b border-border-default flex items-center justify-between">
        <div>
          <span className="text-xs font-mono text-accent-light">{file}</span>
          <span className="ml-2 text-xs text-text-secondary">{description}</span>
        </div>
        {state === 'pending' && (
          <div className="flex gap-2">
            <button
              disabled={busy}
              onClick={() => apply(true)}
              className="px-2 py-0.5 text-xs bg-green-700 hover:bg-green-600 text-white rounded disabled:opacity-50"
            >
              Accept
            </button>
            <button
              disabled={busy}
              onClick={() => apply(false)}
              className="px-2 py-0.5 text-xs bg-surface-overlay hover:bg-surface-overlay text-text-secondary rounded disabled:opacity-50"
            >
              Reject
            </button>
          </div>
        )}
        {state === 'accepted' && <span className="text-xs text-success">Applied ✓</span>}
        {state === 'rejected' && <span className="text-xs text-text-muted">Declined</span>}
      </div>
      <pre className="overflow-x-auto text-xs font-mono px-3 py-2 max-h-60 leading-relaxed">
        {lines.map((line, i) => (
          <div
            key={i}
            className={
              line.startsWith('+') && !line.startsWith('+++')
                ? 'text-success'
                : line.startsWith('-') && !line.startsWith('---')
                ? 'text-error'
                : 'text-text-secondary'
            }
          >
            {line}
          </div>
        ))}
      </pre>
    </div>
  )
}

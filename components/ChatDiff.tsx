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
    await fetch('/api/chat/apply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, accept, file }),
    })
    setState(accept ? 'accepted' : 'rejected')
    setBusy(false)
    onApplied(accept)
  }

  const lines = diff.split('\n')

  return (
    <div className="rounded border border-zinc-700 bg-zinc-900 my-2 overflow-hidden">
      <div className="px-3 py-2 border-b border-zinc-700 flex items-center justify-between">
        <div>
          <span className="text-xs font-mono text-indigo-300">{file}</span>
          <span className="ml-2 text-xs text-zinc-400">{description}</span>
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
              className="px-2 py-0.5 text-xs bg-zinc-700 hover:bg-zinc-600 text-zinc-300 rounded disabled:opacity-50"
            >
              Reject
            </button>
          </div>
        )}
        {state === 'accepted' && <span className="text-xs text-green-400">Applied</span>}
        {state === 'rejected' && <span className="text-xs text-zinc-500">Declined</span>}
      </div>
      <pre className="overflow-x-auto text-xs font-mono px-3 py-2 max-h-60 leading-relaxed">
        {lines.map((line, i) => (
          <div
            key={i}
            className={
              line.startsWith('+') && !line.startsWith('+++')
                ? 'text-green-400'
                : line.startsWith('-') && !line.startsWith('---')
                ? 'text-red-400'
                : 'text-zinc-400'
            }
          >
            {line}
          </div>
        ))}
      </pre>
    </div>
  )
}

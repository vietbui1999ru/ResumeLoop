'use client'
import { useState } from 'react'

interface Props {
  oldJson: string
  newJson: string
  onAccept: () => void
  onReject: () => void
}

function diffLines(a: string, b: string): Array<{ text: string; type: 'add' | 'remove' | 'same' }> {
  const oldLines = a.split('\n')
  const newLines = b.split('\n')
  // Simple line diff — mark removed and added lines
  const result: Array<{ text: string; type: 'add' | 'remove' | 'same' }> = []
  const maxLen = Math.max(oldLines.length, newLines.length)
  for (let i = 0; i < maxLen; i++) {
    const o = oldLines[i]
    const n = newLines[i]
    if (o === n) {
      if (o !== undefined) result.push({ text: o, type: 'same' })
    } else {
      if (o !== undefined) result.push({ text: `- ${o}`, type: 'remove' })
      if (n !== undefined) result.push({ text: `+ ${n}`, type: 'add' })
    }
  }
  return result
}

export function JsonDiffPreview({ oldJson, newJson, onAccept, onReject }: Props) {
  const [busy, setBusy] = useState(false)
  const lines = diffLines(
    JSON.stringify(JSON.parse(oldJson), null, 2),
    JSON.stringify(JSON.parse(newJson), null, 2),
  )
  const changed = lines.filter(l => l.type !== 'same').length

  return (
    <div className="rounded border border-border-default bg-surface-card overflow-hidden">
      <div className="px-3 py-2 border-b border-border-default flex items-center justify-between">
        <span className="text-xs text-text-secondary">{changed} line{changed !== 1 ? 's' : ''} changed</span>
        <div className="flex gap-2">
          <button
            disabled={busy}
            onClick={() => { setBusy(true); onAccept() }}
            className="px-2 py-0.5 text-xs bg-green-700 hover:bg-green-600 text-white rounded disabled:opacity-50"
          >
            Save changes
          </button>
          <button
            disabled={busy}
            onClick={onReject}
            className="px-2 py-0.5 text-xs bg-surface-overlay hover:bg-surface-overlay text-text-secondary rounded"
          >
            Cancel
          </button>
        </div>
      </div>
      <pre className="overflow-x-auto text-xs font-mono px-3 py-2 max-h-72 leading-relaxed">
        {lines.map((line, i) => (
          <div
            key={i}
            className={
              line.type === 'add' ? 'text-green-400'
              : line.type === 'remove' ? 'text-red-400'
              : 'text-text-muted'
            }
          >
            {line.type === 'same' ? `  ${line.text}` : line.text}
          </div>
        ))}
      </pre>
    </div>
  )
}

'use client'
import type { ConflictEntry } from '@/lib/ingest/types'

export function ConflictBanner({ conflicts }: { conflicts: ConflictEntry[] }) {
  if (conflicts.length === 0) return null
  return (
    <div className="bg-amber-950/40 border border-amber-700/50 rounded-lg p-4 space-y-2">
      <p className="text-sm font-medium text-amber-300">
        {conflicts.length} conflict{conflicts.length === 1 ? '' : 's'} found — review before accepting
      </p>
      <ul className="space-y-1">
        {conflicts.map((c, i) => (
          <li key={i} className="text-xs text-amber-200/80">
            <span className="font-mono text-amber-400">{c.field}</span>: {c.description}
          </li>
        ))}
      </ul>
    </div>
  )
}

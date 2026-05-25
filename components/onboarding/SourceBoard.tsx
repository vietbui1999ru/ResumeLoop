'use client'
import { useState, useCallback } from 'react'
import { SmartInput }            from './SmartInput'
import { SourceCard }            from './SourceCard'
import type { IngestionSource, MergeResult } from '@/lib/ingest/types'

function hasSoftMinimum(sources: IngestionSource[]): boolean {
  return sources.some(s => {
    if (s.status !== 'done' || !s.extractedPartial) return false
    const p = s.extractedPartial
    return (p.experience?.length ?? 0) > 0 || (p.projects?.length ?? 0) > 0
  })
}

export function SourceBoard({ onMergeComplete }: { onMergeComplete: (r: MergeResult) => void }) {
  const [sources, setSources]   = useState<IngestionSource[]>([])
  const [merging, setMerging]   = useState(false)
  const [mergeErr, setMergeErr] = useState<string | null>(null)

  const handleSourceAdded = useCallback((src: unknown) => {
    setSources(prev => [src as IngestionSource, ...prev])
  }, [])

  const handleDelete = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/ingest/sources?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
      if (!res.ok) return
    } catch { return }
    setSources(prev => prev.filter(s => s.id !== id))
  }, [])

  const handleBuild = async () => {
    setMerging(true); setMergeErr(null)
    try {
      const res  = await fetch('/api/ingest/merge', { method: 'POST' })
      const data = await res.json() as MergeResult & { error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Merge failed')
      onMergeComplete(data)
    } catch (e) {
      setMergeErr(e instanceof Error ? e.message : String(e))
    } finally {
      setMerging(false)
    }
  }

  const doneSources = sources.filter(s => s.status === 'done')
  const canBuild    = doneSources.length > 0 && hasSoftMinimum(doneSources)
  const warnNoMin   = doneSources.length > 0 && !hasSoftMinimum(doneSources)

  return (
    <div className="space-y-6">
      <SmartInput onSourceAdded={handleSourceAdded} />

      {sources.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-medium text-text-secondary">Sources ({sources.length})</h2>
          {sources.map(s => <SourceCard key={s.id} source={s} onDelete={handleDelete} />)}
        </div>
      )}

      {warnNoMin && (
        <p className="text-xs text-amber-400">
          No work experience or projects found yet — add more sources before building.
        </p>
      )}
      {mergeErr && <p className="text-xs text-red-400">{mergeErr}</p>}

      <button
        onClick={handleBuild} disabled={!canBuild || merging}
        className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-indigo-600 text-white text-sm font-medium rounded-lg transition-colors"
      >
        {merging ? 'Building profile…' : 'Build profile'}
      </button>
    </div>
  )
}

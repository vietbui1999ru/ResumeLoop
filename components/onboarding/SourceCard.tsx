'use client'
import type { IngestionSource } from '@/lib/ingest/types'

const STATUS_RING: Record<IngestionSource['status'], string> = {
  pending:    'border-border-default',
  processing: 'border-amber-600 animate-pulse',
  done:       'border-green-700',
  failed:     'border-red-800',
}

const STATUS_TEXT: Record<IngestionSource['status'], string> = {
  pending: 'Pending', processing: 'Extracting…', done: 'Done', failed: 'Failed',
}

const TYPE_LABEL: Record<IngestionSource['type'], string> = {
  url: 'URL', github: 'GitHub', paste: 'Text',
}

function summary(src: IngestionSource): string {
  if (!src.extractedPartial) return ''
  const p = src.extractedPartial
  const parts: string[] = []
  if (p.experience?.length) parts.push(`${p.experience.length} work entr${p.experience.length === 1 ? 'y' : 'ies'}`)
  if (p.projects?.length)   parts.push(`${p.projects.length} project${p.projects.length === 1 ? '' : 's'}`)
  if (p.contact?.name)      parts.push(`name: ${p.contact.name}`)
  return parts.join(' · ') || 'contact info only'
}

export function SourceCard({ source, onDelete }: { source: IngestionSource; onDelete: (id: string) => void }) {
  return (
    <div className={`flex items-start justify-between gap-3 bg-surface-card border rounded-lg p-4 ${STATUS_RING[source.status]}`}>
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-indigo-400 uppercase tracking-wide">{TYPE_LABEL[source.type]}</span>
          <span className="text-xs text-text-muted">{STATUS_TEXT[source.status]}</span>
        </div>
        <p className="text-sm text-text-secondary truncate">{source.inputRaw}</p>
        {source.status === 'done'   && <p className="text-xs text-text-muted">{summary(source)}</p>}
        {source.status === 'failed' && source.errorMsg && <p className="text-xs text-red-400">{source.errorMsg}</p>}
      </div>
      <button onClick={() => onDelete(source.id)} className="text-text-muted hover:text-text-secondary text-xs shrink-0" aria-label="Remove source">✕</button>
    </div>
  )
}

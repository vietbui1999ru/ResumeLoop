'use client'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical } from 'lucide-react'

interface ExperienceEntry {
  id: string
  title: string
  company: string
  dates?: string
  bullets: string[] | Record<string, string[]>
}

interface Props {
  entry: ExperienceEntry
  excluded: boolean
  onToggle: (id: string) => void
}

export function ExperienceCard({ entry, excluded, onToggle }: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: entry.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  // Get bullet preview (first 2 bullets)
  const bulletList = Array.isArray(entry.bullets)
    ? entry.bullets
    : Object.values(entry.bullets)[0] ?? []
  const preview = bulletList.slice(0, 2)

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex gap-3 p-3 rounded-lg border transition-colors ${
        excluded ? 'border-border-subtle bg-surface-card/30' : 'border-border-default bg-surface-card'
      }`}
    >
      {/* Drag handle */}
      <button
        {...attributes}
        {...listeners}
        className="flex-shrink-0 cursor-grab active:cursor-grabbing text-text-muted hover:text-text-secondary transition-colors"
        aria-label="Drag to reorder"
        title="Drag to reorder"
      >
        <GripVertical size={16} strokeWidth={1.75} />
      </button>

      {/* Toggle checkbox — no icon, shape+color carries the state */}
      <button
        role="checkbox"
        aria-checked={!excluded}
        aria-label={entry.title}
        onClick={() => onToggle(entry.id)}
        className={`flex-shrink-0 w-4 h-4 mt-1 rounded-sm border-2 transition-colors ${
          excluded
            ? 'border-border-strong bg-transparent'
            : 'border-indigo-500 bg-indigo-600'
        }`}
        title={excluded ? 'Click to include' : 'Click to exclude'}
      />

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2">
          <span className={`text-sm font-medium transition-colors ${
            excluded ? 'text-text-muted line-through' : 'text-text-primary'
          }`}>
            {entry.title}
          </span>
          <span className={`text-xs transition-colors ${excluded ? 'text-text-muted line-through' : 'text-text-muted'}`}>
            {entry.company}
          </span>
          {entry.dates && (
            <span className={`text-xs ml-auto transition-colors ${excluded ? 'text-text-muted' : 'text-text-muted'}`}>
              {entry.dates}
            </span>
          )}
        </div>
        {preview.length > 0 && (
          <ul className="mt-1 space-y-0.5">
            {preview.map((b, i) => (
              <li key={i} className={`text-xs truncate transition-colors ${excluded ? 'text-text-muted line-through' : 'text-text-muted'}`}>
                · {b}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

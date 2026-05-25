'use client'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

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
        excluded ? 'border-zinc-800 bg-zinc-900/30' : 'border-zinc-700 bg-zinc-900'
      }`}
    >
      {/* Drag handle */}
      <button
        {...attributes}
        {...listeners}
        className="flex-shrink-0 cursor-grab active:cursor-grabbing text-zinc-600 hover:text-zinc-400 mt-1"
        aria-label="Drag to reorder"
      >
        ⠿
      </button>

      {/* Toggle checkbox — no icon, shape+color carries the state */}
      <button
        onClick={() => onToggle(entry.id)}
        className={`flex-shrink-0 w-4 h-4 mt-1 rounded-sm border-2 transition-colors ${
          excluded
            ? 'border-zinc-600 bg-transparent'
            : 'border-indigo-500 bg-indigo-600'
        }`}
        aria-label={excluded ? 'Include this entry' : 'Exclude this entry'}
        title={excluded ? 'Click to include' : 'Click to exclude'}
      />

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2">
          <span className={`text-sm font-medium transition-colors ${
            excluded ? 'text-zinc-600 line-through' : 'text-zinc-200'
          }`}>
            {entry.title}
          </span>
          <span className={`text-xs transition-colors ${excluded ? 'text-zinc-700 line-through' : 'text-zinc-500'}`}>
            {entry.company}
          </span>
          {entry.dates && (
            <span className={`text-xs ml-auto transition-colors ${excluded ? 'text-zinc-700' : 'text-zinc-600'}`}>
              {entry.dates}
            </span>
          )}
        </div>
        {preview.length > 0 && (
          <ul className="mt-1 space-y-0.5">
            {preview.map((b, i) => (
              <li key={i} className={`text-xs truncate transition-colors ${excluded ? 'text-zinc-700 line-through' : 'text-zinc-500'}`}>
                · {b}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

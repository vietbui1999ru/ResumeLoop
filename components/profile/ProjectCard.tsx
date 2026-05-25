'use client'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Eye, EyeOff, GripVertical } from 'lucide-react'

interface ProjectEntry {
  id: string
  name: string
  dates?: string
  short_stack?: string
  bullets: string[]
}

interface Props {
  entry: ProjectEntry
  excluded: boolean
  onToggle: (id: string) => void
}

export function ProjectCard({ entry, excluded, onToggle }: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: entry.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : excluded ? 0.4 : 1,
  }

  const preview = entry.bullets.slice(0, 2)

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex gap-3 p-3 rounded-lg border transition-colors ${
        excluded ? 'border-zinc-800 bg-zinc-900/30' : 'border-zinc-700 bg-zinc-900'
      }`}
    >
      <button
        {...attributes}
        {...listeners}
        className="flex-shrink-0 cursor-grab active:cursor-grabbing text-zinc-600 hover:text-zinc-400 transition-colors"
        aria-label="Drag to reorder"
        title="Drag to reorder"
      >
        <GripVertical size={16} strokeWidth={1.75} />
      </button>

      <button
        onClick={() => onToggle(entry.id)}
        className={`flex-shrink-0 w-6 h-6 flex items-center justify-center mt-1 rounded border transition-colors ${
          excluded
            ? 'border-zinc-600 text-zinc-600'
            : 'border-indigo-500 bg-indigo-600 text-white'
        }`}
        aria-label={excluded ? 'Include this project' : 'Exclude this project'}
        title={excluded ? 'Click to include' : 'Click to exclude'}
      >
        {excluded ? <EyeOff size={16} strokeWidth={1.75} /> : <Eye size={16} strokeWidth={1.75} />}
      </button>

      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2">
          <span className={`text-sm font-medium ${excluded ? 'text-zinc-500' : 'text-zinc-200'}`}>
            {entry.name}
          </span>
          {entry.short_stack && (
            <span className="text-xs text-zinc-500">{entry.short_stack}</span>
          )}
          {entry.dates && <span className="text-xs text-zinc-600 ml-auto">{entry.dates}</span>}
        </div>
        {preview.length > 0 && (
          <ul className="mt-1 space-y-0.5">
            {preview.map((b, i) => (
              <li key={i} className="text-xs text-zinc-500 truncate">· {b}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

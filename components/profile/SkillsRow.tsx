'use client'
import { DndContext, closestCenter, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, useSortable, horizontalListSortingStrategy, arrayMove } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

interface Props {
  skills: Record<string, string[]>
  onChange: (newSkills: Record<string, string[]>) => void
}

function SkillChip({ id, label, vals }: { id: string; label: string; vals: string[] }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id })
  const style = { transform: CSS.Transform.toString(transform), transition }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="cursor-grab active:cursor-grabbing px-3 py-1.5 rounded-lg border border-zinc-700 bg-zinc-900 flex-shrink-0"
      title={vals.join(', ')}
    >
      <span className="text-xs font-medium text-zinc-300">{label}:</span>
      <span className="text-xs text-zinc-500 ml-1">{vals.slice(0, 3).join(' · ')}{vals.length > 3 ? '…' : ''}</span>
    </div>
  )
}

export function SkillsRow({ skills, onChange }: Props) {
  const keys = Object.keys(skills)

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIdx = keys.indexOf(String(active.id))
    const newIdx = keys.indexOf(String(over.id))
    const newKeys = arrayMove(keys, oldIdx, newIdx)
    const reordered = Object.fromEntries(newKeys.map(k => [k, skills[k]]))
    onChange(reordered)
  }

  return (
    <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={keys} strategy={horizontalListSortingStrategy}>
        <div className="flex flex-wrap gap-2">
          {keys.map(k => (
            <SkillChip key={k} id={k} label={k} vals={skills[k] ?? []} />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  )
}

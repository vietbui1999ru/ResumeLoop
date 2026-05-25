'use client'
import { DndContext, closestCenter, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, useSortable, horizontalListSortingStrategy, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useMediaQuery } from '@/hooks/useMediaQuery'

function toArray(v: unknown): string[] {
  if (Array.isArray(v)) return v as string[]
  if (typeof v === 'string') return v.split(/[,·]/).map(s => s.trim()).filter(Boolean)
  return []
}

interface Props {
  skills: Record<string, string[]>
  onChange: (newSkills: Record<string, string[]>) => void
}

function SkillChip({ id, label, vals, isVertical }: { id: string; label: string; vals: string[]; isVertical?: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  const style = { transform: CSS.Transform.toString(transform), transition }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`cursor-grab active:cursor-grabbing px-3 py-1.5 rounded-lg border border-border-default bg-surface-card flex-shrink-0
                   transition-all ${isDragging ? 'opacity-50 scale-95' : 'opacity-100'} ${isVertical ? 'w-full' : ''}`}
      title={vals.join(', ')}
    >
      <span className="text-xs font-medium text-text-secondary">{label}:</span>
      <span className="text-xs text-text-muted ml-1">{vals.slice(0, 3).join(' · ')}{vals.length > 3 ? '…' : ''}</span>
    </div>
  )
}

export function SkillsRow({ skills, onChange }: Props) {
  const keys = Object.keys(skills)
  const isDesktop = useMediaQuery('(min-width: 1024px)')

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIdx = keys.indexOf(String(active.id))
    const newIdx = keys.indexOf(String(over.id))
    const newKeys = arrayMove(keys, oldIdx, newIdx)
    const reordered = Object.fromEntries(newKeys.map(k => [k, skills[k]]))
    onChange(reordered)
  }

  // Choose strategy based on screen size
  const strategy = isDesktop ? horizontalListSortingStrategy : verticalListSortingStrategy
  const containerClass = isDesktop 
    ? 'flex flex-wrap gap-2'  // Desktop: wrap horizontally
    : 'flex flex-col gap-2'   // Mobile: stack vertically

  return (
    <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={keys} strategy={strategy}>
        <div className={containerClass}>
          {keys.map(k => (
            <SkillChip 
              key={k} 
              id={k} 
              label={k} 
              vals={toArray(skills[k])}
              isVertical={!isDesktop}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  )
}

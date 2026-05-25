'use client'
import { useEffect, useState } from 'react'

type Position = 'above' | 'below' | 'left' | 'right'
type Align    = 'left'  | 'right' | 'center'

const POS_CLASS: Record<Position, (align: Align) => string> = {
  below: a => `top-full mt-2 ${a === 'right' ? 'right-0' : a === 'center' ? 'left-1/2 -translate-x-1/2' : 'left-0'}`,
  above: a => `bottom-full mb-2 ${a === 'right' ? 'right-0' : a === 'center' ? 'left-1/2 -translate-x-1/2' : 'left-0'}`,
  right: _align => 'left-full ml-3 top-0',
  left:  _align => 'right-full mr-3 top-0',
}

const ARROW_CLASS: Record<Position, string> = {
  below: 'absolute -top-[7px] left-4 w-3 h-3 bg-surface-overlay border-l border-t border-border-strong rotate-45',
  above: 'absolute -bottom-[7px] left-4 w-3 h-3 bg-surface-overlay border-r border-b border-border-strong rotate-45',
  right: 'absolute -left-[7px] top-3 w-3 h-3 bg-surface-overlay border-l border-b border-border-strong rotate-45',
  left:  'absolute -right-[7px] top-3 w-3 h-3 bg-surface-overlay border-r border-t border-border-strong rotate-45',
}

export function TourBubble({
  tourKey,
  title,
  body,
  position = 'below',
  align = 'left',
  width = 260,
}: {
  tourKey:   string
  title:     string
  body:      string
  position?: Position
  align?:    Align
  width?:    number
}) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    setVisible(!localStorage.getItem(`tour_${tourKey}`))
  }, [tourKey])

  if (!visible) return null

  const dismiss = () => {
    localStorage.setItem(`tour_${tourKey}`, '1')
    setVisible(false)
  }

  return (
    <div
      className={`absolute z-50 ${POS_CLASS[position](align)}`}
      style={{ width }}
      onClick={e => e.stopPropagation()}
    >
      <div className={ARROW_CLASS[position]} />
      <div className="relative bg-surface-overlay border border-border-strong rounded-lg p-3 shadow-xl shadow-black/20">
        <p className="text-xs font-semibold text-text-primary mb-1">{title}</p>
        <p className="text-xs text-text-secondary leading-relaxed">{body}</p>
        <button
          onClick={dismiss}
          className="mt-2.5 text-xs px-3 py-1 bg-accent hover:bg-accent/90 text-white rounded transition-colors"
        >
          Got it
        </button>
      </div>
    </div>
  )
}

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
  below: 'absolute -top-[7px] left-4 w-3 h-3 bg-indigo-950 border-l border-t border-indigo-600/60 rotate-45',
  above: 'absolute -bottom-[7px] left-4 w-3 h-3 bg-indigo-950 border-r border-b border-indigo-600/60 rotate-45',
  right: 'absolute -left-[7px] top-3 w-3 h-3 bg-indigo-950 border-l border-b border-indigo-600/60 rotate-45',
  left:  'absolute -right-[7px] top-3 w-3 h-3 bg-indigo-950 border-r border-t border-indigo-600/60 rotate-45',
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
      <div className="relative bg-indigo-950 border border-indigo-600/60 rounded-lg p-3 shadow-xl shadow-black/50">
        <p className="text-xs font-semibold text-indigo-200 mb-1">{title}</p>
        <p className="text-xs text-zinc-300 leading-relaxed">{body}</p>
        <button
          onClick={dismiss}
          className="mt-2.5 text-xs px-3 py-1 bg-indigo-600 hover:bg-indigo-500 rounded transition-colors"
        >
          Got it
        </button>
      </div>
    </div>
  )
}

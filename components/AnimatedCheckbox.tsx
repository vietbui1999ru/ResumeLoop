'use client'
import { motion } from 'framer-motion'
import { DURATION, EASE } from '@/lib/motion'

interface Props {
  checked: boolean
  onChange: (checked: boolean) => void
  className?: string
  label?: string
}

export function AnimatedCheckbox({ checked, onChange, className = '', label }: Props) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label ?? 'Select'}
      onClick={() => onChange(!checked)}
      className={`w-4 h-4 rounded flex items-center justify-center border transition-colors duration-100 ${
        checked
          ? 'bg-indigo-500 border-indigo-500'
          : 'bg-transparent border-zinc-600 hover:border-zinc-400'
      } ${className}`}
    >
      <svg
        viewBox="0 0 10 8"
        fill="none"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        stroke="white"
        className="w-2.5 h-2"
      >
        <motion.path
          d="M1 4L3.5 6.5L9 1"
          strokeDasharray="12"
          animate={{ strokeDashoffset: checked ? 0 : 12 }}
          transition={{ duration: DURATION.fast, ease: EASE }}
        />
      </svg>
    </button>
  )
}

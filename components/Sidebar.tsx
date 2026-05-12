'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTourContext } from '@/contexts/TourContext'

const NAV = [
  { href: '/jobs',     label: 'Jobs' },
  { href: '/',         label: 'Dashboard' },
  { href: '/chat',     label: 'Chat' },
  { href: '/config',   label: 'Config' },
  { href: '/settings', label: 'Settings' },
]

export function Sidebar() {
  const pathname  = usePathname()
  const { reset } = useTourContext()
  return (
    <nav className="w-44 shrink-0 border-r border-zinc-700 bg-zinc-900 flex flex-col gap-1 p-4 h-full overflow-y-auto">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-semibold text-zinc-500 uppercase">ResumeAnalyze</p>
        <button
          onClick={reset}
          title="Restart tour"
          className="text-[10px] w-4 h-4 flex items-center justify-center rounded-full border border-zinc-700 text-zinc-500 hover:text-zinc-300 hover:border-zinc-500 transition-colors"
        >?</button>
      </div>
      {NAV.map(({ href, label }) => (
        <Link
          key={href}
          href={href}
          className={`px-3 py-2 rounded text-sm font-medium transition-colors ${
            pathname === href
              ? 'bg-zinc-700 text-white'
              : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
          }`}
        >
          {label}
        </Link>
      ))}
    </nav>
  )
}

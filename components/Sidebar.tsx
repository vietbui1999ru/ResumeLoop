'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const NAV = [
  { href: '/',         label: 'Dashboard' },
  { href: '/jobs',     label: 'Jobs' },
  { href: '/config',   label: 'Config' },
  { href: '/settings', label: 'Settings' },
]

export function Sidebar() {
  const pathname = usePathname()
  return (
    <nav className="w-44 shrink-0 border-r border-zinc-700 bg-zinc-900 flex flex-col gap-1 p-4">
      <p className="text-xs font-semibold text-zinc-500 uppercase mb-3">ResumeAnalyze</p>
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

'use client'
import { useRef, useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Briefcase,
  LayoutDashboard,
  MessageSquare,
  FileText,
  Settings2,
  UserCircle,
  HelpCircle,
  Heart,
} from 'lucide-react'
import { useTourContext } from '@/contexts/TourContext'

const NAV = [
  { href: '/jobs', label: 'Jobs', Icon: Briefcase },
  { href: '/', label: 'Dashboard', Icon: LayoutDashboard },
  { href: '/chat', label: 'Chat', Icon: MessageSquare },
  { href: '/config', label: 'Config', Icon: FileText },
  { href: '/settings', label: 'Settings', Icon: Settings2 },
]

const PAGE_LABELS: Record<string, string> = {
  '/': 'Dashboard',
  '/jobs': 'Jobs',
  '/settings': 'Settings',
  '/chat': 'Chat',
  '/config': 'Config',
}

export function Sidebar() {
  const pathname = usePathname()
  const { reset, pagesWithUnseen, activateForPage } = useTourContext()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  // Close dropdown on outside click
  useEffect(() => {
    if (!menuOpen) return
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [menuOpen])

  const hasUnseen = pagesWithUnseen.length > 0

  return (
    <nav className="w-12 shrink-0 border-r border-zinc-800 bg-surface-card flex flex-col items-center py-3 gap-1 h-full">
      {/* Logo mark */}
      <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center mb-2 shrink-0">
        <span className="text-2xs font-bold text-white tracking-tight">RA</span>
      </div>

      {/* Nav items */}
      {NAV.map(({ href, label, Icon }) => {
        const active = pathname === href
        return (
          <Link
            key={href}
            href={href}
            title={label}
            aria-label={label}
            aria-current={active ? 'page' : undefined}
            className={`relative w-8 h-8 rounded-lg flex items-center justify-center transition-colors duration-100 ${active
              ? 'bg-surface-raised text-indigo-400'
              : 'text-text-muted hover:text-text-secondary hover:bg-surface-raised'
              }`}
          >
            {active && (
              <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-4 bg-indigo-500 rounded-r-full -ml-px" />
            )}
            <Icon size={16} strokeWidth={1.75} />
          </Link>
        )
      })}

      {/* Spacer */}
      <div className="flex-1" />

      {/* Donation link — replace DONATION_URL when Ko-fi/etc. is set up */}
      <a
        href="https://ko-fi.com/memeconnoisseur"
        target="_blank"
        rel="noopener noreferrer"
        title="Support this project ($5)"
        aria-label="Support this project"
        className="w-8 h-8 rounded-lg flex items-center justify-center text-text-muted hover:text-pink-400 hover:bg-surface-raised transition-colors duration-100"
      >
        <Heart size={16} strokeWidth={1.75} />
      </a>

      {/* Tour help button + beacon + dropdown */}
      <div className="relative" ref={menuRef}>
        {/* animate-ping beacon ring when unseen steps remain */}
        {hasUnseen && (
          <span className="absolute top-0.5 right-0.5 flex h-2 w-2 pointer-events-none">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500" />
          </span>
        )}

        <button
          onClick={() => {
            if (hasUnseen) {
              setMenuOpen(v => !v)
            } else {
              reset()
            }
          }}
          title={hasUnseen ? 'Tour — unseen pages' : 'Restart tour'}
          className="w-8 h-8 rounded-lg flex items-center justify-center text-text-muted hover:text-text-secondary hover:bg-surface-raised transition-colors duration-100"
        >
          <HelpCircle size={16} strokeWidth={1.75} />
        </button>

        {/* Unseen pages dropdown */}
        {menuOpen && hasUnseen && (
          <div className="absolute bottom-full left-full mb-1 ml-1 w-44 bg-surface-card border border-zinc-700 rounded-lg shadow-xl shadow-black/50 py-1 z-[90]">
            <p className="px-3 py-1.5 text-2xs font-semibold text-zinc-500 uppercase tracking-wider">
              Continue tour
            </p>
            {pagesWithUnseen.map(page => (
              <button
                key={page}
                onClick={() => {
                  setMenuOpen(false)
                  activateForPage(page)
                }}
                className="w-full text-left px-3 py-1.5 text-xs text-zinc-300 hover:bg-surface-raised hover:text-zinc-100 transition-colors"
              >
                {PAGE_LABELS[page] ?? page}
              </button>
            ))}
            <div className="border-t border-zinc-800 mt-1 pt-1">
              <button
                onClick={() => { setMenuOpen(false); reset() }}
                className="w-full text-left px-3 py-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                Restart tour
              </button>
            </div>
          </div>
        )}
      </div>

      <Link
        href="/account"
        title="Account"
        aria-label="Account"
        className="w-8 h-8 rounded-full bg-surface-raised flex items-center justify-center text-text-muted hover:text-text-secondary transition-colors duration-100"
      >
        <UserCircle size={18} strokeWidth={1.75} />
      </Link>
    </nav>
  )
}

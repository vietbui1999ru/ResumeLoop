'use client'
import { Menu } from 'lucide-react'
import { usePathname } from 'next/navigation'

const PAGE_LABELS: Record<string, string> = {
  '/':          'Dashboard',
  '/jobs':      'Jobs',
  '/settings':  'Settings',
  '/chat':      'Chat',
  '/config':    'Config',
  '/account':   'Account',
  '/feedback':  'Feedback',
}

interface MobileHeaderProps {
  onMenuOpen: () => void
}

export function MobileHeader({ onMenuOpen }: MobileHeaderProps) {
  const pathname = usePathname()
  return (
    <header className="flex lg:hidden fixed top-0 left-0 right-0 z-30 h-12
                       bg-surface-card border-b border-zinc-800
                       items-center px-4 gap-3
                       pt-[env(safe-area-inset-top)]">
      <button
        onClick={onMenuOpen}
        aria-label="Open navigation menu"
        className="w-10 h-10 flex items-center justify-center
                   text-text-muted hover:text-text-secondary rounded-lg
                   hover:bg-surface-raised transition-colors"
      >
        <Menu size={20} strokeWidth={1.75} />
      </button>
      <div className="w-6 h-6 rounded-md bg-indigo-600 flex items-center justify-center shrink-0">
        <span className="text-2xs font-bold text-white tracking-tight">RA</span>
      </div>
      <span className="text-sm font-medium text-text-primary">
        {PAGE_LABELS[pathname] ?? 'ResumeLoop'}
      </span>
    </header>
  )
}

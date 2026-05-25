'use client'
import { useRef, useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Briefcase, LayoutDashboard, MessageSquare, FileText,
  Settings2, UserCircle, HelpCircle, Heart, Star, X,
} from 'lucide-react'
import { useTourContext } from '@/contexts/TourContext'

const NAV = [
  { href: '/jobs',     label: 'Jobs',      Icon: Briefcase },
  { href: '/chat',     label: 'Chat',      Icon: MessageSquare },
  { href: '/',         label: 'Dashboard', Icon: LayoutDashboard },
  { href: '/config',   label: 'Config',    Icon: FileText },
  { href: '/settings', label: 'Settings',  Icon: Settings2 },
  { href: '/account',  label: 'Account',   Icon: UserCircle },
]

const PAGE_LABELS: Record<string, string> = {
  '/':          'Dashboard',
  '/jobs':      'Jobs',
  '/settings':  'Settings',
  '/chat':      'Chat',
  '/config':    'Config',
  '/account':   'Account',
  '/feedback':  'Feedback',
}

interface MobileDrawerProps {
  open: boolean
  onClose: () => void
}

export function MobileDrawer({ open, onClose }: MobileDrawerProps) {
  const pathname = usePathname()
  const { reset, pagesWithUnseen, activateForPage } = useTourContext()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => { if (!open) setMenuOpen(false) }, [open])

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

  const handleNavClick = () => {
    onClose()
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/50 z-40"
          />
          {/* Drawer */}
          <motion.div
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 280 }}
            className="fixed inset-y-0 left-0 w-64 z-50 bg-surface-card border-r border-border-subtle flex flex-col
                       pt-[env(safe-area-inset-top)]"
          >
            {/* Close button */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border-subtle">
              <div className="w-6 h-6 rounded-md bg-indigo-600 flex items-center justify-center">
                <span className="text-2xs font-bold text-white tracking-tight">RL</span>
              </div>
              <button
                onClick={onClose}
                aria-label="Close navigation menu"
                className="w-8 h-8 flex items-center justify-center
                           text-text-muted hover:text-text-secondary rounded-lg
                           hover:bg-surface-raised transition-colors"
              >
                <X size={18} strokeWidth={1.75} />
              </button>
            </div>

            {/* Nav items */}
            <nav className="flex-1 overflow-y-auto px-2 py-3">
              {NAV.map(({ href, label, Icon }) => {
                const active = pathname === href
                return (
                  <Link
                    key={href}
                    href={href}
                    onClick={handleNavClick}
                    aria-current={active ? 'page' : undefined}
                    className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-lg transition-colors duration-100 ${
                      active
                        ? 'bg-surface-raised text-indigo-400'
                        : 'text-text-muted hover:text-text-secondary hover:bg-surface-raised'
                    }`}
                  >
                    <Icon size={18} strokeWidth={1.75} />
                    <span className="text-sm font-medium">{label}</span>
                  </Link>
                )
              })}
            </nav>

            {/* Bottom section */}
            <div className="border-t border-border-subtle px-2 py-3 space-y-2" style={{ paddingBottom: `calc(1rem + env(safe-area-inset-bottom))` }}>
              {/* Feedback link */}
              <Link
                href="/feedback"
                onClick={handleNavClick}
                className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-lg transition-colors duration-100 ${
                  pathname === '/feedback'
                    ? 'text-indigo-400 bg-surface-raised'
                    : 'text-text-muted hover:text-text-secondary hover:bg-surface-raised'
                }`}
              >
                <Star size={18} strokeWidth={1.75} />
                <span className="text-sm font-medium">Feedback</span>
              </Link>

              {/* Donation link */}
              <a
                href="https://ko-fi.com/memeconnoisseur"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg
                           text-text-muted hover:text-pink-400 hover:bg-surface-raised transition-colors duration-100"
              >
                <Heart size={18} strokeWidth={1.75} />
                <span className="text-sm font-medium">Support</span>
              </a>

              {/* Tour help button with beacon and dropdown */}
              <div className="relative" ref={menuRef}>
                {hasUnseen && (
                  <span className="absolute top-1.5 left-2 flex h-2 w-2 pointer-events-none">
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
                      onClose()
                    }
                  }}
                  title={hasUnseen ? 'Tour — unseen pages' : 'Restart tour'}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg
                             text-text-muted hover:text-text-secondary hover:bg-surface-raised transition-colors duration-100"
                >
                  <HelpCircle size={18} strokeWidth={1.75} />
                  <span className="text-sm font-medium">Help & Tour</span>
                </button>

                {menuOpen && hasUnseen && (
                  <div className="absolute bottom-full left-0 mb-2 w-full bg-surface-card border border-border-default rounded-lg shadow-card py-1 z-[90]">
                    <p className="px-3 py-1.5 text-2xs font-semibold text-text-muted uppercase tracking-wider">
                      Continue tour
                    </p>
                    {pagesWithUnseen.map(page => (
                      <button
                        key={page}
                        onClick={() => {
                          setMenuOpen(false)
                          activateForPage(page)
                          onClose()
                        }}
                        className="w-full text-left px-3 py-1.5 text-xs text-text-secondary hover:bg-surface-raised hover:text-text-primary transition-colors"
                      >
                        {PAGE_LABELS[page] ?? page}
                      </button>
                    ))}
                    <div className="border-t border-border-subtle mt-1 pt-1">
                      <button
                        onClick={() => {
                          setMenuOpen(false)
                          reset()
                          onClose()
                        }}
                        className="w-full text-left px-3 py-1.5 text-xs text-text-muted hover:text-text-secondary transition-colors"
                      >
                        Restart tour
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

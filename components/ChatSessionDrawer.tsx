'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { X } from 'lucide-react'
import { fmtDate } from '@/lib/job-display'

interface Session {
  id: string
  name: string
  created_at: string
}

interface ChatSessionDrawerProps {
  open: boolean
  onClose: () => void
  sessions: Session[]
  activeSessionId?: string
  onStartNew: () => void
  onSelectSession: (id: string) => void
}

export function ChatSessionDrawer({
  open,
  onClose,
  sessions,
  activeSessionId,
  onStartNew,
  onSelectSession,
}: ChatSessionDrawerProps) {
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
            className="fixed inset-y-0 left-0 w-64 z-50 bg-surface-base border-r border-border-subtle flex flex-col
                       pt-[env(safe-area-inset-top)]"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border-subtle">
              <h2 className="text-sm font-semibold text-text-secondary">Sessions</h2>
              <button
                onClick={onClose}
                aria-label="Close sessions drawer"
                className="w-8 h-8 flex items-center justify-center
                           text-text-muted hover:text-text-secondary rounded-lg
                           hover:bg-surface-raised transition-colors"
              >
                <X size={18} strokeWidth={1.75} />
              </button>
            </div>

            {/* New session button */}
            <div className="px-3 py-2 border-b border-border-subtle flex-shrink-0">
              <button
                onClick={() => {
                  onStartNew()
                  onClose()
                }}
                className="w-full text-xs text-indigo-400 hover:text-indigo-300 text-left
                           transition-colors"
              >
                + New session
              </button>
            </div>

            {/* Sessions list */}
            <nav className="flex-1 overflow-y-auto min-h-0 px-2 py-2">
              {sessions.length === 0 ? (
                <p className="px-3 py-4 text-xs text-text-muted text-center">
                  No sessions yet
                </p>
              ) : (
                sessions.map(s => (
                  <button
                    key={s.id}
                    onClick={() => {
                      onSelectSession(s.id)
                      onClose()
                    }}
                    className={`w-full text-left px-3 py-2 text-xs rounded-lg transition-colors
                               ${s.id === activeSessionId
                      ? 'bg-surface-raised text-text-primary'
                      : 'text-text-secondary hover:text-text-primary hover:bg-surface-raised/50'
                    }`}
                  >
                    <p className="text-text-secondary truncate font-medium">{s.name}</p>
                    <p className="text-text-muted text-2xs">{fmtDate(s.created_at)}</p>
                  </button>
                ))
              )}
            </nav>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

'use client'
import { Menu } from 'lucide-react'

interface ChatMobileHeaderProps {
  onOpenSidebar: () => void
}

export function ChatMobileHeader({ onOpenSidebar }: ChatMobileHeaderProps) {
  return (
    <div className="flex items-center gap-2 px-4 py-3 border-b border-border-subtle flex-shrink-0">
      <button
        onClick={onOpenSidebar}
        className="p-2 hover:bg-surface-raised rounded transition-colors"
        aria-label="Open chat sessions"
        title="Show sessions"
      >
        <Menu size={20} strokeWidth={1.5} />
      </button>
      <span className="text-sm font-medium text-text-secondary">Chat</span>
    </div>
  )
}

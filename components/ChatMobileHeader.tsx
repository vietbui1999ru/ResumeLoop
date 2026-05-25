'use client'
import { Menu } from 'lucide-react'

interface ChatMobileHeaderProps {
  onOpenSidebar: () => void
}

export function ChatMobileHeader({ onOpenSidebar }: ChatMobileHeaderProps) {
  return (
    <div className="flex items-center gap-2 px-4 py-3 border-b border-zinc-800 flex-shrink-0">
      <button
        onClick={onOpenSidebar}
        className="p-2 hover:bg-zinc-800 rounded transition-colors"
        aria-label="Open chat sessions"
        title="Show sessions"
      >
        <Menu size={20} strokeWidth={1.5} />
      </button>
      <span className="text-sm font-medium text-zinc-300">Chat</span>
    </div>
  )
}

'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Briefcase,
  LayoutDashboard,
  MessageSquare,
  FileText,
  Settings2,
  UserCircle,
} from 'lucide-react'

const NAV = [
  { href: '/jobs',     label: 'Jobs',      Icon: Briefcase },
  { href: '/',         label: 'Dashboard', Icon: LayoutDashboard },
  { href: '/chat',     label: 'Chat',      Icon: MessageSquare },
  { href: '/config',   label: 'Config',    Icon: FileText },
  { href: '/settings', label: 'Settings',  Icon: Settings2 },
]

export function Sidebar() {
  const pathname = usePathname()
  return (
    <nav className="w-12 shrink-0 border-r border-zinc-800 bg-surface-card flex flex-col items-center py-3 gap-1 h-full">
      {/* Logo mark */}
      <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center mb-2 shrink-0">
        <span className="text-[10px] font-bold text-white tracking-tight">RA</span>
      </div>

      {/* Nav items */}
      {NAV.map(({ href, label, Icon }) => {
        const active = pathname === href
        return (
          <Link
            key={href}
            href={href}
            title={label}
            className={`relative w-8 h-8 rounded-lg flex items-center justify-center transition-colors duration-100 ${
              active
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

      {/* Spacer + account */}
      <div className="flex-1" />
      <Link
        href="/account"
        title="Account"
        className="w-8 h-8 rounded-full bg-surface-raised flex items-center justify-center text-text-muted hover:text-text-secondary transition-colors duration-100"
      >
        <UserCircle size={18} strokeWidth={1.75} />
      </Link>
    </nav>
  )
}

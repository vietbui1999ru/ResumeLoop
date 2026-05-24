'use client'
import { useState } from 'react'
import { MobileHeader } from './MobileHeader'
import { MobileDrawer } from './MobileDrawer'

interface ShellClientProps {
  children: React.ReactNode
}

export function ShellClient({ children }: ShellClientProps) {
  const [drawerOpen, setDrawerOpen] = useState(false)

  return (
    <>
      <MobileHeader onMenuOpen={() => setDrawerOpen(true)} />
      <MobileDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
      {/* Spacer clears MobileHeader: h-12 fixed height + pt-safe-area-inset-top padding */}
      <div className="h-[calc(3rem+env(safe-area-inset-top))] lg:hidden shrink-0" aria-hidden />
      <div className="flex flex-1 overflow-hidden">
        {children}
      </div>
    </>
  )
}

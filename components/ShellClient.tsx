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
      {/* Spacer so content isn't hidden under mobile header */}
      <div className="h-12 lg:hidden shrink-0" aria-hidden />
      <div className="flex flex-1 overflow-hidden">
        {children}
      </div>
    </>
  )
}

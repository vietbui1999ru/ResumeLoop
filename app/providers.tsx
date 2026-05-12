'use client'
import { SessionProvider } from '@/contexts/SessionContext'
import { TourProvider } from '@/contexts/TourContext'

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <TourProvider>{children}</TourProvider>
    </SessionProvider>
  )
}

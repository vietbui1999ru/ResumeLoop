'use client'
import { SessionProvider as NextAuthProvider } from 'next-auth/react'
import { SessionProvider } from '@/contexts/SessionContext'
import { TourProvider } from '@/contexts/TourContext'

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <NextAuthProvider>
      <SessionProvider>
        <TourProvider>{children}</TourProvider>
      </SessionProvider>
    </NextAuthProvider>
  )
}

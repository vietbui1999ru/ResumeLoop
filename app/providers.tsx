'use client'
import { SessionProvider as NextAuthProvider } from 'next-auth/react'
import { SessionProvider } from '@/contexts/SessionContext'
import { TourProvider } from '@/contexts/TourContext'
import { FontSizeSync } from '@/components/FontSizeSync'

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <NextAuthProvider>
      <SessionProvider>
        <TourProvider>
          <FontSizeSync />
          {children}
        </TourProvider>
      </SessionProvider>
    </NextAuthProvider>
  )
}

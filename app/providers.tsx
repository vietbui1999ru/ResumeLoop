'use client'
import { SessionProvider as NextAuthProvider } from 'next-auth/react'
import { SessionProvider } from '@/contexts/SessionContext'

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <NextAuthProvider>
      <SessionProvider>{children}</SessionProvider>
    </NextAuthProvider>
  )
}

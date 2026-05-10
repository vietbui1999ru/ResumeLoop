'use client'
import { SessionProvider } from '@/contexts/SessionContext'

export function Providers({ children }: { children: React.ReactNode }) {
  return <SessionProvider>{children}</SessionProvider>
}

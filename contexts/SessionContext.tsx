'use client'
import { createContext, useContext, useState } from 'react'

interface SessionContextValue {
  activeSessionId: string
  setActiveSessionId: (id: string) => void
}

const SessionContext = createContext<SessionContextValue | null>(null)

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [activeSessionId, setActiveSessionId] = useState('default')
  return (
    <SessionContext.Provider value={{ activeSessionId, setActiveSessionId }}>
      {children}
    </SessionContext.Provider>
  )
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext)
  if (!ctx) throw new Error('useSession must be used within SessionProvider')
  return ctx
}

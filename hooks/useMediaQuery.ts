'use client'
import { useState, useEffect } from 'react'

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false)
  useEffect(() => {
    const mql = window.matchMedia(query)
    setMatches(mql.matches)
    const handler = (e: MediaQueryListEvent) => setMatches(e.matches)
    if (typeof mql.addEventListener === 'function') {
      mql.addEventListener('change', handler)
      return () => mql.removeEventListener('change', handler)
    } else {
      // Fallback for Safari/iOS ≤13 where addEventListener('change') is absent.
      // TypeScript DOM lib removed addListener/removeListener, so `as any` is required.
      // Safe to drop this branch once iOS 14+ (released 2020) is the floor.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(mql as any).addListener(handler)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return () => (mql as any).removeListener(handler)
    }
  }, [query])
  return matches
}

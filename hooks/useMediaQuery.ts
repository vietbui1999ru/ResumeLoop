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
      // Legacy Safari/iOS 13 and earlier
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(mql as any).addListener(handler)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return () => (mql as any).removeListener(handler)
    }
  }, [query])
  return matches
}

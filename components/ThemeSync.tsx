'use client'
import { useEffect } from 'react'
import { applyTheme, isValidTheme, THEME_KEY } from '@/lib/theme'

/** Restores persisted theme after React hydration strips it. */
export function ThemeSync() {
  useEffect(() => {
    const stored = localStorage.getItem(THEME_KEY)
    if (isValidTheme(stored)) applyTheme(stored)
  }, [])
  return null
}

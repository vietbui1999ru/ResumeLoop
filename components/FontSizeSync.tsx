'use client'
import { useEffect } from 'react'
import { applyFontSize, isValidFontSize, FONT_SIZE_KEY } from '@/lib/font-size'

/** Restores persisted font-size class after React hydration strips it. */
export function FontSizeSync() {
  useEffect(() => {
    const stored = localStorage.getItem(FONT_SIZE_KEY)
    if (isValidFontSize(stored)) applyFontSize(stored)
  }, [])
  return null
}

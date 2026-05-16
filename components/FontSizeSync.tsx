'use client'
import { useEffect } from 'react'
import { applyFontSize, isValidFontSize } from '@/lib/font-size'

/** Restores persisted font-size class after React hydration strips it. */
export function FontSizeSync() {
  useEffect(() => {
    const stored = localStorage.getItem('rl-font-size')
    if (isValidFontSize(stored)) applyFontSize(stored)
  }, [])
  return null
}

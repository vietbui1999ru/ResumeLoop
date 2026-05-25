'use client'
import { useState, useEffect } from 'react'
import { Sun, Moon } from 'lucide-react'
import { applyTheme, isValidTheme, THEME_KEY, type Theme } from '@/lib/theme'

interface ThemeToggleProps {
  className?: string
  size?: number
}

export function ThemeToggle({ className = '', size = 16 }: ThemeToggleProps) {
  const [theme, setTheme] = useState<Theme>('dark')

  useEffect(() => {
    const stored = localStorage.getItem(THEME_KEY)
    setTheme(isValidTheme(stored) ? stored : 'dark')
  }, [])

  function toggle() {
    const next: Theme = theme === 'dark' ? 'light' : 'dark'
    applyTheme(next)
    localStorage.setItem(THEME_KEY, next)
    setTheme(next)
  }

  return (
    <button
      onClick={toggle}
      title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      className={className}
    >
      {theme === 'dark'
        ? <Sun  size={size} strokeWidth={1.75} />
        : <Moon size={size} strokeWidth={1.75} />}
    </button>
  )
}

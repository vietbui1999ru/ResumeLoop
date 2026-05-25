export const THEME_KEY = 'rl:theme'
export const THEMES = ['dark', 'light'] as const
export type Theme = typeof THEMES[number]

export function isValidTheme(s: string | null): s is Theme {
  return s === 'dark' || s === 'light'
}

export function applyTheme(theme: Theme): void {
  const html = document.documentElement
  if (theme === 'light') {
    html.classList.remove('dark')
    html.classList.add('light')
  } else {
    html.classList.remove('light')
    html.classList.add('dark')
  }
}

/** Blocking inline script — runs before paint, prevents theme FOUC on reload. */
export function buildThemeInitScript(): string {
  return (
    `try{` +
    `var t=localStorage.getItem('${THEME_KEY}');` +
    `var h=document.documentElement;` +
    `if(t==='light'){h.classList.remove('dark');h.classList.add('light');}` +
    `else{h.classList.add('dark');}` +
    `}catch(e){}`
  )
}

import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      fontSize: {
        // Unitless line-heights so spacing scales with html font-size (large/medium/small modes).
        // Tailwind's defaults use absolute rem line-heights which don't scale.
        '2xs': ['0.625rem', { lineHeight: '1.5' }],
        'xs':  ['0.75rem',  { lineHeight: '1.5' }],
        'sm':  ['0.875rem', { lineHeight: '1.5' }],
        'base':['1rem',     { lineHeight: '1.5' }],
        'lg':  ['1.125rem', { lineHeight: '1.5' }],
        'xl':  ['1.25rem',  { lineHeight: '1.4' }],
        '2xl': ['1.5rem',   { lineHeight: '1.35' }],
      },
      colors: {
        'surface-base':   '#09090b',
        'surface-card':   '#18181b',
        'surface-raised': '#27272a',
        'border-subtle':  '#1c1c1f',
        'text-primary':   '#fafafa',
        'text-secondary': '#a1a1aa',
        'text-muted':     '#52525b',
        accent:           '#6366f1',
      },
    },
  },
  plugins: [],
}

export default config

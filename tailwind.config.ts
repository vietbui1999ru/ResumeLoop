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

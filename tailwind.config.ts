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
        'surface-base':    'rgb(var(--color-surface-base)    / <alpha-value>)',
        'surface-card':    'rgb(var(--color-surface-card)    / <alpha-value>)',
        'surface-raised':  'rgb(var(--color-surface-raised)  / <alpha-value>)',
        'surface-overlay': 'rgb(var(--color-surface-overlay) / <alpha-value>)',
        'border-subtle':   'rgb(var(--color-border-subtle)   / <alpha-value>)',
        'border-default':  'rgb(var(--color-border-default)  / <alpha-value>)',
        'border-strong':   'rgb(var(--color-border-strong)   / <alpha-value>)',
        'text-primary':    'rgb(var(--color-text-primary)    / <alpha-value>)',
        'text-secondary':  'rgb(var(--color-text-secondary)  / <alpha-value>)',
        'text-muted':      'rgb(var(--color-text-muted)      / <alpha-value>)',
        'accent':          'rgb(var(--color-accent)          / <alpha-value>)',
        'accent-light':    'rgb(var(--color-accent-light)    / <alpha-value>)',
        'accent-subtle':   'rgb(var(--color-accent-subtle)   / <alpha-value>)',
        'error':           'rgb(var(--color-error)           / <alpha-value>)',
        'success':         'rgb(var(--color-success)         / <alpha-value>)',
        'warning':         'rgb(var(--color-warning)         / <alpha-value>)',
      },
      // Semantic radius aliases — use in Wave 3 className migration
      borderRadius: {
        'card':  'var(--radius-lg)',
        'modal': 'var(--radius-2xl)',
        'badge': 'var(--radius-full)',
      },
      // Semantic shadow aliases — use in Wave 3 className migration
      boxShadow: {
        'card':  'var(--shadow-card)',
        'modal': 'var(--shadow-modal)',
      },
      // Override default font stacks with CSS var — takes effect immediately on font-sans / font-mono classes
      fontFamily: {
        sans: ['var(--font-sans)'],
        mono: ['var(--font-mono)'],
      },
    },
  },
  plugins: [],
}

export default config

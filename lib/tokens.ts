// SSR-safe typed constants for JS consumers (Recharts, inline styles).
// Source of truth is app/globals.css :root — keep values in sync manually.
// Values here must exactly match the CSS vars in globals.css.

export const FIT_THRESHOLDS = {
  green: 80,
  amber: 60,
} as const

export const SURFACE_COLORS = {
  base:    '#09090b',
  card:    '#18181b',
  raised:  '#27272a',
  overlay: '#3f3f46',
} as const

export const BORDER_COLORS = {
  subtle:  '#1c1c1f',
  default: '#3f3f46',
  strong:  '#52525b',
} as const

export const TEXT_COLORS = {
  primary:   '#fafafa',
  secondary: '#a1a1aa',
  muted:     '#52525b',
} as const

export const SEMANTIC_COLORS = {
  accent:       '#6366f1',
  accentLight:  '#818cf8',
  accentSubtle: '#1e1b4b',
  error:        '#f87171',
  success:      '#4ade80',
  warning:      '#fbbf24',
} as const

export const CHART_COLORS = {
  scraped:     '#6366f1',
  proceed:     '#818cf8',
  resumeBuilt: '#3b82f6',
  applied:     '#fbbf24',
  interviewed: '#fb923c',
  offer:       '#4ade80',
  rejected:    '#f87171',
  visaKill:    '#f43f5e',
  pending:     '#71717a',
  other:       '#52525b',
} as const

export const FONT = {
  sans: 'system-ui, -apple-system, sans-serif',
  mono: 'ui-monospace, SFMono-Regular, monospace',
} as const

export const RADIUS = {
  sm:   '0.25rem',
  md:   '0.375rem',
  lg:   '0.5rem',
  xl:   '0.75rem',
  '2xl': '1rem',
  full: '9999px',
} as const

export const SHADOW = {
  sm:    '0 1px 2px rgb(0 0 0 / 0.5)',
  card:  '0 20px 25px -5px rgb(0 0 0 / 0.5), 0 8px 10px -6px rgb(0 0 0 / 0.5)',
  modal: '0 25px 50px -12px rgb(0 0 0 / 0.7)',
} as const

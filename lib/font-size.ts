export const FONT_SIZES = ['small', 'medium', 'large'] as const
export type FontSize = typeof FONT_SIZES[number]

export const FONT_SIZE_KEY = 'rl-font-size'

export const FONT_SIZE_LABELS: Record<FontSize, string> = {
  small:  'Small',
  medium: 'Medium',
  large:  'Large',
}

/** CSS variable values — immune to Tailwind content scanning. */
const FONT_SCALE_MAP: Record<FontSize, string> = {
  small:  '1.00',
  medium: '1.15',
  large:  '1.30',
}

export function isValidFontSize(s: string | null): s is FontSize {
  return s !== null && (FONT_SIZES as readonly string[]).includes(s)
}

export function fontClass(s: FontSize): string {
  return `font-${s}`
}

/** Script injected before-interactive to avoid FOUC on reload. */
export function buildFontInitScript(): string {
  const valid = FONT_SIZES.map(s => `'${s}'`).join(',')
  const classes = FONT_SIZES.map(s => `'${fontClass(s)}'`).join(',')
  // Inline the scale map so the script is self-contained.
  const scaleEntries = FONT_SIZES.map(s => `'${s}':'${FONT_SCALE_MAP[s]}'`).join(',')
  return (
    `try{` +
    `var f=localStorage.getItem('${FONT_SIZE_KEY}');` +
    `if([${valid}].indexOf(f)!==-1){` +
    `var h=document.documentElement;` +
    `var m={${scaleEntries}};` +
    `h.style.setProperty('--font-scale',m[f]);` +
    `[${classes}].forEach(function(c){h.classList.remove(c)});` +
    `h.classList.add('font-'+f)` +
    `}` +
    `}catch(e){}`
  )
}

/**
 * Applies the given font size to the root HTML element.
 * Sets --font-scale CSS variable (primary, immune to Tailwind purging) and
 * also toggles the font-* class (backward compat / init script alignment).
 */
export function applyFontSize(size: FontSize, root: HTMLElement = document.documentElement): void {
  root.style.setProperty('--font-scale', FONT_SCALE_MAP[size])
  FONT_SIZES.forEach(s => root.classList.remove(fontClass(s)))
  root.classList.add(fontClass(size))
}

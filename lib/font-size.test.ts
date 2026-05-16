import { describe, it, expect } from 'vitest'
import {
  FONT_SIZES,
  isValidFontSize,
  fontClass,
  buildFontInitScript,
  applyFontSize,
} from './font-size'

describe('FONT_SIZES', () => {
  it('contains exactly small, medium, large in that order', () => {
    expect(FONT_SIZES).toEqual(['small', 'medium', 'large'])
  })
})

describe('isValidFontSize', () => {
  it('accepts all valid sizes', () => {
    for (const s of FONT_SIZES) {
      expect(isValidFontSize(s)).toBe(true)
    }
  })

  it('rejects null', () => {
    expect(isValidFontSize(null)).toBe(false)
  })

  it('rejects unknown strings', () => {
    expect(isValidFontSize('huge')).toBe(false)
    expect(isValidFontSize('xl')).toBe(false)
    expect(isValidFontSize('')).toBe(false)
  })
})

describe('fontClass', () => {
  it('returns correct CSS class for each size', () => {
    expect(fontClass('small')).toBe('font-small')
    expect(fontClass('medium')).toBe('font-medium')
    expect(fontClass('large')).toBe('font-large')
  })
})

describe('buildFontInitScript', () => {
  it('contains the localStorage key', () => {
    const script = buildFontInitScript()
    expect(script).toContain('rl-font-size')
  })

  it('references all three font classes', () => {
    const script = buildFontInitScript()
    for (const s of FONT_SIZES) {
      expect(script).toContain(fontClass(s))
    }
  })

  it('removes existing font classes before adding the new one', () => {
    const script = buildFontInitScript()
    expect(script).toContain('classList.remove')
    expect(script).toContain('classList.add')
  })
})

// Helper: minimal HTMLElement-like classList mock
function makeRoot(initial: string[] = []) {
  const classes = new Set<string>(initial)
  return {
    classList: {
      add:    (c: string) => { classes.add(c) },
      remove: (c: string) => { classes.delete(c) },
      contains:(c: string) => classes.has(c),
      get _classes() { return classes },
    },
  } as unknown as HTMLElement
}

describe('applyFontSize', () => {
  it('adds the correct font class to root', () => {
    const root = makeRoot()
    applyFontSize('large', root)
    expect((root.classList as unknown as { _classes: Set<string> })._classes.has('font-large')).toBe(true)
  })

  it('removes all other font classes before adding new one', () => {
    // Start with font-small already on root
    const root = makeRoot(['font-small', 'font-medium'])
    applyFontSize('large', root)
    const cls = (root.classList as unknown as { _classes: Set<string> })._classes
    expect(cls.has('font-small')).toBe(false)
    expect(cls.has('font-medium')).toBe(false)
    expect(cls.has('font-large')).toBe(true)
  })

  it('applying same size twice leaves exactly one font class', () => {
    const root = makeRoot(['font-medium'])
    applyFontSize('medium', root)
    applyFontSize('medium', root)
    const cls = (root.classList as unknown as { _classes: Set<string> })._classes
    const fontClasses = [...cls].filter(c => c.startsWith('font-'))
    expect(fontClasses).toHaveLength(1)
    expect(fontClasses[0]).toBe('font-medium')
  })

  it('switching size removes old and sets new', () => {
    const root = makeRoot()
    applyFontSize('small', root)
    applyFontSize('large', root)
    const cls = (root.classList as unknown as { _classes: Set<string> })._classes
    expect(cls.has('font-small')).toBe(false)
    expect(cls.has('font-large')).toBe(true)
  })
})

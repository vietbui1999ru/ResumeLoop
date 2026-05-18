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

// Avoids jsdom dependency — applyFontSize only needs classList + style, not a full DOM.
function makeRoot(initial: string[] = []) {
  const classes = new Set<string>(initial)
  const styleProps = new Map<string, string>()
  return {
    classList: {
      add:     (c: string) => { classes.add(c) },
      remove:  (c: string) => { classes.delete(c) },
      contains:(c: string) => classes.has(c),
      get _classes() { return classes },
    },
    style: {
      setProperty: (prop: string, val: string) => { styleProps.set(prop, val) },
      getPropertyValue: (prop: string) => styleProps.get(prop) ?? '',
      get _props() { return styleProps },
    },
  } as unknown as HTMLElement
}

type RootMock = ReturnType<typeof makeRoot>
function classes(root: RootMock) {
  return (root.classList as unknown as { _classes: Set<string> })._classes
}
function styleProps(root: RootMock) {
  return (root.style as unknown as { _props: Map<string, string> })._props
}

describe('applyFontSize', () => {
  it('adds the correct font class to root', () => {
    const root = makeRoot()
    applyFontSize('large', root)
    expect(classes(root).has('font-large')).toBe(true)
  })

  it('removes all other font classes before adding new one', () => {
    const root = makeRoot(['font-small', 'font-medium'])
    applyFontSize('large', root)
    expect(classes(root).has('font-small')).toBe(false)
    expect(classes(root).has('font-medium')).toBe(false)
    expect(classes(root).has('font-large')).toBe(true)
  })

  it('applying same size twice leaves exactly one font class', () => {
    const root = makeRoot(['font-medium'])
    applyFontSize('medium', root)
    applyFontSize('medium', root)
    const fontClasses = [...classes(root)].filter(c => c.startsWith('font-'))
    expect(fontClasses).toHaveLength(1)
    expect(fontClasses[0]).toBe('font-medium')
  })

  it('switching size removes old and sets new', () => {
    const root = makeRoot()
    applyFontSize('small', root)
    applyFontSize('large', root)
    expect(classes(root).has('font-small')).toBe(false)
    expect(classes(root).has('font-large')).toBe(true)
  })

  it('sets --font-scale CSS variable for each size', () => {
    const cases: [import('./font-size').FontSize, string][] = [
      ['small',  '1.00'],
      ['medium', '1.15'],
      ['large',  '1.30'],
    ]
    for (const [size, expected] of cases) {
      const root = makeRoot()
      applyFontSize(size, root)
      expect(styleProps(root).get('--font-scale')).toBe(expected)
    }
  })

  it('--font-scale updates when size changes', () => {
    const root = makeRoot()
    applyFontSize('small', root)
    expect(styleProps(root).get('--font-scale')).toBe('1.00')
    applyFontSize('large', root)
    expect(styleProps(root).get('--font-scale')).toBe('1.30')
  })
})

describe('buildFontInitScript — CSS variable', () => {
  it('sets --font-scale via style.setProperty', () => {
    const script = buildFontInitScript()
    expect(script).toContain('--font-scale')
    expect(script).toContain('setProperty')
  })

  it('includes scale values for all sizes', () => {
    const script = buildFontInitScript()
    expect(script).toContain('1.00')
    expect(script).toContain('1.15')
    expect(script).toContain('1.30')
  })
})

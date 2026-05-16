import { describe, it, expect } from 'vitest'
import {
  FONT_SIZES,
  isValidFontSize,
  fontClass,
  buildFontInitScript,
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

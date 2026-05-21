import { describe, it, expect } from 'vitest'
import { VALID_ACTIONS } from './actions'

describe('VALID_ACTIONS', () => {
  it('contains all expected pipeline stages in order', () => {
    expect(VALID_ACTIONS).toEqual([
      '0-Saved',
      '1-Applied',
      '2-Phone Screen',
      '3-Interview',
      '4-Offer',
      '5-Rejected',
      '6-Ghosted',
    ])
  })

  it('has numeric prefix for sort order', () => {
    for (const a of VALID_ACTIONS) {
      expect(a).toMatch(/^\d-/)
    }
  })

  it('rejects unknown values via includes check', () => {
    const invalid = ['saved', 'Applied', 'offer', '', 'Hired', '7-Unknown']
    for (const v of invalid) {
      expect((VALID_ACTIONS as readonly string[]).includes(v)).toBe(false)
    }
  })

  it('accepts all valid values via includes check', () => {
    for (const a of VALID_ACTIONS) {
      expect((VALID_ACTIONS as readonly string[]).includes(a)).toBe(true)
    }
  })
})

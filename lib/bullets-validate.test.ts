import { describe, it, expect } from 'vitest'
import { validateBulletsJson } from './bullets-validate'

const LONG = 'A'.repeat(117) // 117 chars — over 116 limit

describe('validateBulletsJson', () => {
  it('returns null for valid JSON with all bullets within limit', () => {
    const json = JSON.stringify({
      experience: [{ id: 'gitlab', bullets: { genai: ['Short bullet'] } }],
      projects: [{ id: 'resumeloop', bullets: ['Also short'] }],
    })
    expect(validateBulletsJson(json)).toBeNull()
  })

  it('returns error string for invalid JSON syntax', () => {
    const err = validateBulletsJson('{ bad json')
    expect(err).not.toBeNull()
    expect(err).toMatch(/invalid json/i)
  })

  it('reports an experience bullet over 116 chars with its path', () => {
    const json = JSON.stringify({
      experience: [{ id: 'gitlab', bullets: { genai: [LONG] } }],
    })
    const err = validateBulletsJson(json)
    expect(err).not.toBeNull()
    expect(err).toMatch(/gitlab/)
    expect(err).toMatch(/117/)
  })

  it('reports a project bullet over 116 chars with its path', () => {
    const json = JSON.stringify({
      projects: [{ id: 'resumeloop', name: 'ResumeLoop', bullets: [LONG] }],
    })
    const err = validateBulletsJson(json)
    expect(err).not.toBeNull()
    expect(err).toMatch(/resumeloop/i)
    expect(err).toMatch(/117/)
  })

  it('reports ALL over-limit bullets, not just the first', () => {
    const json = JSON.stringify({
      experience: [{ id: 'job1', bullets: { v: [LONG, LONG] } }],
    })
    const err = validateBulletsJson(json)
    // Should mention two violations
    expect((err?.match(/117/g) ?? []).length).toBeGreaterThanOrEqual(2)
  })

  it('returns null when experience and projects are missing', () => {
    expect(validateBulletsJson(JSON.stringify({ contact: { name: 'Viet' } }))).toBeNull()
  })

  it('returns null for empty arrays', () => {
    expect(validateBulletsJson(JSON.stringify({ experience: [], projects: [] }))).toBeNull()
  })
})

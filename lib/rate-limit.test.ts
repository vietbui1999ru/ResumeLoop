import { describe, it, expect, vi, beforeEach } from 'vitest'
import { checkRateLimit, extractIp, _resetForTesting } from './rate-limit'

beforeEach(() => {
  _resetForTesting()
})

describe('checkRateLimit', () => {
  it('allows the first request', () => {
    expect(checkRateLimit('1.2.3.4')).toBe(true)
  })

  it('allows up to max requests in the window', () => {
    for (let i = 0; i < 10; i++) checkRateLimit('1.2.3.4')
    expect(checkRateLimit('1.2.3.4')).toBe(false)
  })

  it('respects per-IP isolation', () => {
    for (let i = 0; i < 10; i++) checkRateLimit('1.2.3.4')
    expect(checkRateLimit('5.6.7.8')).toBe(true)
  })

  it('accepts custom window and max opts', () => {
    for (let i = 0; i < 3; i++) checkRateLimit('9.9.9.9', { max: 3 })
    expect(checkRateLimit('9.9.9.9', { max: 3 })).toBe(false)
  })

  it('allows requests again after window expires', () => {
    vi.useFakeTimers()
    for (let i = 0; i < 10; i++) checkRateLimit('1.2.3.4')
    expect(checkRateLimit('1.2.3.4')).toBe(false)
    vi.advanceTimersByTime(60_001)
    expect(checkRateLimit('1.2.3.4')).toBe(true)
    vi.useRealTimers()
  })
})

describe('extractIp', () => {
  it('returns first address from x-forwarded-for', () => {
    const req = new Request('http://localhost/', {
      headers: { 'x-forwarded-for': '1.2.3.4, 5.6.7.8' },
    })
    expect(extractIp(req)).toBe('1.2.3.4')
  })

  it('returns "local" when header absent', () => {
    const req = new Request('http://localhost/')
    expect(extractIp(req)).toBe('local')
  })
})

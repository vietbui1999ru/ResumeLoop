import { describe, it, expect, vi, beforeEach } from 'vitest'
import { checkRateLimit, extractIp, _resetForTesting, checkRateLimitBucket, _resetBucketsForTesting } from './rate-limit'

beforeEach(() => {
  _resetForTesting()
  _resetBucketsForTesting()
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

describe('checkRateLimitBucket', () => {
  it('allows the first request', () => {
    expect(checkRateLimitBucket('chat:user-1', 20, 20)).toBe(true)
  })

  it('blocks when bucket is exhausted', () => {
    for (let i = 0; i < 20; i++) checkRateLimitBucket('chat:user-1', 20, 20)
    expect(checkRateLimitBucket('chat:user-1', 20, 20)).toBe(false)
  })

  it('isolates per key — exhausted key does not affect another', () => {
    for (let i = 0; i < 20; i++) checkRateLimitBucket('chat:user-1', 20, 20)
    expect(checkRateLimitBucket('chat:user-2', 20, 20)).toBe(true)
  })

  it('refills tokens after time passes', () => {
    vi.useFakeTimers()
    for (let i = 0; i < 20; i++) checkRateLimitBucket('chat:user-1', 20, 20)
    expect(checkRateLimitBucket('chat:user-1', 20, 20)).toBe(false)
    vi.advanceTimersByTime(60_001) // 1 full minute — refills all 20 tokens
    expect(checkRateLimitBucket('chat:user-1', 20, 20)).toBe(true)
    vi.useRealTimers()
  })

  it('respects custom maxTokens cap', () => {
    for (let i = 0; i < 5; i++) checkRateLimitBucket('generate:user-1', 5, 5)
    expect(checkRateLimitBucket('generate:user-1', 5, 5)).toBe(false)
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

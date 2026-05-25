import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/demo-seed',  () => ({ getOrCreateDemoUserForIp: vi.fn() }))
vi.mock('@/lib/rate-limit', () => ({ checkRateLimitAsync: vi.fn() }))
vi.mock('next/headers',     () => ({ headers: vi.fn() }))

import { getOrCreateDemoUserForIp } from '@/lib/demo-seed'
import { checkRateLimitAsync }       from '@/lib/rate-limit'
import { headers }                   from 'next/headers'
import { POST }                      from './route'

const mockGetOrCreate = vi.mocked(getOrCreateDemoUserForIp)
const mockCheckRL     = vi.mocked(checkRateLimitAsync)
const mockHeaders     = vi.mocked(headers)

function makeHeaderMap(ip = '1.2.3.4'): { get: (k: string) => string | null } {
  return { get: (k: string) => (k === 'x-forwarded-for' ? ip : null) }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockHeaders.mockResolvedValue(makeHeaderMap() as any)
  mockCheckRL.mockResolvedValue({ success: true } as any)
  mockGetOrCreate.mockResolvedValue({ email: 'demo_x@demo.local', password: 'pass123' })
})

describe('POST /api/auth/demo', () => {
  it('returns 429 when rate limit exceeded', async () => {
    mockCheckRL.mockResolvedValue({ success: false } as any)
    const res = await POST()
    expect(res.status).toBe(429)
    expect(await res.json()).toEqual({ error: 'Too many requests' })
  })

  it('returns a one-time token (not email/password) from getOrCreateDemoUserForIp', async () => {
    const res = await POST()
    expect(res.status).toBe(200)
    const body = await res.json() as { token?: string }
    expect(body).not.toHaveProperty('email')
    expect(body).not.toHaveProperty('password')
    expect(body.token).toMatch(/^[0-9a-f]{64}$/)
  })

  it('passes sha256 hash of ip to getOrCreateDemoUserForIp', async () => {
    await POST()
    const [ipHash] = mockGetOrCreate.mock.calls[0] as [string]
    expect(ipHash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('uses different ip_hash for different IPs', async () => {
    mockHeaders.mockResolvedValue(makeHeaderMap('5.6.7.8') as any)
    await POST()
    const [hash1] = mockGetOrCreate.mock.calls[0] as [string]

    vi.clearAllMocks()
    mockHeaders.mockResolvedValue(makeHeaderMap('9.9.9.9') as any)
    mockCheckRL.mockResolvedValue({ success: true } as any)
    mockGetOrCreate.mockResolvedValue({ email: 'demo_y@demo.local', password: 'pass456' })
    await POST()
    const [hash2] = mockGetOrCreate.mock.calls[0] as [string]

    expect(hash1).not.toBe(hash2)
  })

  it('returns 500 when getOrCreateDemoUserForIp throws', async () => {
    mockGetOrCreate.mockRejectedValue(new Error('db error'))
    const res = await POST()
    expect(res.status).toBe(500)
  })
})

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/db-adapter', () => ({ getAdapter: vi.fn() }))
vi.mock('@/lib/demo-seed',  () => ({ seedDemoUser: vi.fn() }))
vi.mock('@/lib/rate-limit', () => ({ checkRateLimitAsync: vi.fn() }))
vi.mock('next/headers',     () => ({ headers: vi.fn() }))
vi.mock('bcryptjs',         () => ({ default: { hash: vi.fn().mockResolvedValue('hashed') } }))

import { getAdapter }          from '@/lib/db-adapter'
import { seedDemoUser }        from '@/lib/demo-seed'
import { checkRateLimitAsync } from '@/lib/rate-limit'
import { headers }             from 'next/headers'
import { POST }                from './route'

const mockGetAdapter          = vi.mocked(getAdapter)
const mockSeedDemoUser        = vi.mocked(seedDemoUser)
const mockCheckRateLimit      = vi.mocked(checkRateLimitAsync)
const mockHeaders             = vi.mocked(headers)

function makeHeaderMap(ip = '1.2.3.4'): { get: (k: string) => string | null } {
  return { get: (k: string) => (k === 'x-forwarded-for' ? ip : null) }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockHeaders.mockResolvedValue(makeHeaderMap() as any)
  mockCheckRateLimit.mockResolvedValue({ success: true } as any)
  mockSeedDemoUser.mockResolvedValue(undefined)
})

describe('POST /api/auth/demo', () => {
  it('returns 429 when rate limit exceeded', async () => {
    mockCheckRateLimit.mockResolvedValue({ success: false } as any)

    const res = await POST()
    expect(res.status).toBe(429)
    const body = await res.json()
    expect(body).toEqual({ error: 'Too many requests' })
  })

  it('returns email and password on success', async () => {
    const mockRun = vi.fn()
    mockGetAdapter.mockResolvedValue({ run: mockRun } as any)

    const res = await POST()
    expect(res.status).toBe(200)

    const body = await res.json() as { email: string; password: string }
    expect(body.email).toMatch(/^demo_[0-9a-f-]+@demo\.local$/)
    expect(typeof body.password).toBe('string')
    expect(body.password.length).toBeGreaterThan(0)
  })

  it('inserts user with is_demo=1 and email_verified=1', async () => {
    const mockRun = vi.fn()
    mockGetAdapter.mockResolvedValue({ run: mockRun } as any)

    await POST()

    expect(mockRun).toHaveBeenCalledOnce()
    const [sql, params] = mockRun.mock.calls[0] as [string, unknown[]]
    expect(sql).toContain('INSERT INTO users')
    // is_demo and email_verified are hardcoded as 1 in the SQL, not bound params
    expect(sql).toContain('is_demo')
    expect(sql).toContain('email_verified')
    expect(sql).toContain(', 1, 1)')
    // Only id, email, hash are bound params
    expect(params).toHaveLength(3)
  })

  it('calls seedDemoUser with the newly created user id', async () => {
    const mockRun = vi.fn()
    mockGetAdapter.mockResolvedValue({ run: mockRun } as any)

    await POST()

    expect(mockSeedDemoUser).toHaveBeenCalledOnce()
    const [calledId] = mockSeedDemoUser.mock.calls[0] as [string]
    expect(calledId).toMatch(/^[0-9a-f-]{36}$/)

    // The id passed to seed must match what was inserted into users
    const insertedId = (mockRun.mock.calls[0][1] as unknown[])[0]
    expect(calledId).toBe(insertedId)
  })

  it('uses the ip from x-forwarded-for for rate limiting', async () => {
    mockHeaders.mockResolvedValue(makeHeaderMap('9.8.7.6') as any)
    const mockRun = vi.fn()
    mockGetAdapter.mockResolvedValue({ run: mockRun } as any)

    await POST()

    const [key] = mockCheckRateLimit.mock.calls[0] as [string]
    expect(key).toContain('9.8.7.6')
  })

  it('returns 500 when DB insert fails', async () => {
    mockGetAdapter.mockResolvedValue({
      run: vi.fn().mockRejectedValue(new Error('db error')),
    } as any)

    const res = await POST()
    expect(res.status).toBe(500)
  })

  it('returns 500 when seedDemoUser fails', async () => {
    mockGetAdapter.mockResolvedValue({ run: vi.fn() } as any)
    mockSeedDemoUser.mockRejectedValue(new Error('seed error'))

    const res = await POST()
    expect(res.status).toBe(500)
  })
})

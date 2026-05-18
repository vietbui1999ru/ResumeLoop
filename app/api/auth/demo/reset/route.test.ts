import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/auth',       () => ({ auth: vi.fn() }))
vi.mock('@/lib/db-adapter', () => ({ getAdapter: vi.fn() }))
vi.mock('@/lib/demo-seed',  () => ({ resetDemoUser: vi.fn() }))
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimitAsync: vi.fn().mockResolvedValue({ success: true, remaining: 2, reset: 0 }),
  extractIp: vi.fn().mockReturnValue('127.0.0.1'),
}))

import { auth }          from '@/lib/auth'
import { getAdapter }    from '@/lib/db-adapter'
import { resetDemoUser } from '@/lib/demo-seed'
import { POST }          from './route'

const mockAuth       = vi.mocked(auth)
const mockGetAdapter = vi.mocked(getAdapter)
const mockResetDemo  = vi.mocked(resetDemoUser)

function makeDb(ipHash: string | null = 'hash-abc') {
  return {
    queryOne: vi.fn().mockResolvedValue(ipHash !== null ? { ip_hash: ipHash } : undefined),
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockAuth.mockResolvedValue({ user: { id: 'demo-123', isDemo: true } } as any)
  mockGetAdapter.mockResolvedValue(makeDb() as any)
  mockResetDemo.mockResolvedValue({ email: 'demo_new@demo.local', password: 'newpass' })
})

describe('POST /api/auth/demo/reset', () => {
  it('returns 401 when not authenticated', async () => {
    mockAuth.mockResolvedValue(null as any)
    const res = await POST(new Request('http://localhost/api/auth/demo/reset', { method: 'POST' }))
    expect(res.status).toBe(401)
  })

  it('returns 403 when user is not a demo account', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'real-user', isDemo: false } } as any)
    const res = await POST(new Request('http://localhost/api/auth/demo/reset', { method: 'POST' }))
    expect(res.status).toBe(403)
  })

  it('returns 404 when demo user has no ip_hash', async () => {
    mockGetAdapter.mockResolvedValue(makeDb(null) as any)
    const res = await POST(new Request('http://localhost/api/auth/demo/reset', { method: 'POST' }))
    expect(res.status).toBe(404)
  })

  it('calls resetDemoUser with userId and ip_hash', async () => {
    const res = await POST(new Request('http://localhost/api/auth/demo/reset', { method: 'POST' }))
    expect(res.status).toBe(200)
    expect(mockResetDemo).toHaveBeenCalledWith('demo-123', 'hash-abc')
    expect(res.status).toBe(200)
  })

  it('returns new email and password', async () => {
    const res = await POST(new Request('http://localhost/api/auth/demo/reset', { method: 'POST' }))
    expect(await res.json()).toEqual({ email: 'demo_new@demo.local', password: 'newpass' })
  })

  it('returns 500 when resetDemoUser throws', async () => {
    mockResetDemo.mockRejectedValue(new Error('db error'))
    const res = await POST(new Request('http://localhost/api/auth/demo/reset', { method: 'POST' }))
    expect(res.status).toBe(500)
  })
})

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/db-adapter', () => ({ getAdapter: vi.fn() }))
vi.mock('@/lib/app-mode', () => ({ isCloud: vi.fn() }))

import { getAdapter } from '@/lib/db-adapter'
import { isCloud } from '@/lib/app-mode'
import { POST } from './route'

const mockGetAdapter = vi.mocked(getAdapter)
const mockIsCloud = vi.mocked(isCloud)

function makeReq(secret?: string): Request {
  const headers: Record<string, string> = {}
  if (secret) headers['x-purge-secret'] = secret
  return new Request('http://localhost/api/admin/purge', { method: 'POST', headers })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('PURGE_SECRET', 'test-secret')
  mockIsCloud.mockReturnValue(true)
})

describe('POST /api/admin/purge', () => {
  it('returns 403 when secret header is missing', async () => {
    const res = await POST(makeReq())
    expect(res.status).toBe(403)
  })

  it('returns 403 when secret is wrong', async () => {
    const res = await POST(makeReq('wrong-secret'))
    expect(res.status).toBe(403)
  })

  it('returns 403 in local mode even with correct secret', async () => {
    mockIsCloud.mockReturnValue(false)
    const res = await POST(makeReq('test-secret'))
    expect(res.status).toBe(403)
  })

  it('returns purged count of 0 when no expired accounts exist', async () => {
    mockGetAdapter.mockResolvedValue({
      query: vi.fn().mockResolvedValue([]),
      run: vi.fn(),
    } as any)

    const res = await POST(makeReq('test-secret'))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toEqual({ purged: 0 })
  })

  it('hard-deletes all data for each expired user in FK-safe order', async () => {
    const mockRun = vi.fn()
    mockGetAdapter.mockResolvedValue({
      query: vi.fn().mockResolvedValue([{ id: 'expired-user' }]),
      run: mockRun,
    } as any)

    const res = await POST(makeReq('test-secret'))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toEqual({ purged: 1 })

    const allCalls = mockRun.mock.calls.map(([sql]: [string]) => sql)
    // transaction wraps each user's deletes
    expect(allCalls[0]).toBe('BEGIN')
    expect(allCalls[allCalls.length - 1]).toBe('COMMIT')
    // users row must be deleted last among DELETE statements
    const deleteCalls = allCalls.filter((s: string) => s.trim().startsWith('DELETE'))
    expect(deleteCalls[deleteCalls.length - 1]).toMatch(/DELETE FROM users/)
    // all non-transaction calls used the expired user's id or the scoped key
    expect(mockRun).toHaveBeenCalledWith(expect.any(String), ['expired-user'])
  })
})

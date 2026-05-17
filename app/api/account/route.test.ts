import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))
vi.mock('@/lib/db-adapter', () => ({ getAdapter: vi.fn() }))
vi.mock('@/lib/account', () => ({ changePassword: vi.fn() }))

import { auth } from '@/lib/auth'
import { getAdapter } from '@/lib/db-adapter'
import { DELETE } from './route'

const mockAuth = vi.mocked(auth)
const mockGetAdapter = vi.mocked(getAdapter)

beforeEach(() => {
  vi.clearAllMocks()
})

describe('DELETE /api/account', () => {
  it('returns 401 when not authenticated', async () => {
    mockAuth.mockResolvedValue(null as any)
    const res = await DELETE()
    expect(res.status).toBe(401)
  })

  it('returns 403 for demo accounts', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'demo-1', isDemo: true } } as any)
    const res = await DELETE()
    expect(res.status).toBe(403)
  })

  it('soft-deletes the account by setting deleted_at', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'user-1', isDemo: false } } as any)
    const mockRun = vi.fn()
    mockGetAdapter.mockResolvedValue({ run: mockRun } as any)

    const res = await DELETE()
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.message).toMatch(/15 days/)
    expect(mockRun).toHaveBeenCalledWith(
      expect.stringContaining('deleted_at'),
      ['user-1'],
    )
  })

  it('does NOT hard-delete the user row', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'user-1', isDemo: false } } as any)
    const mockRun = vi.fn()
    mockGetAdapter.mockResolvedValue({ run: mockRun } as any)

    await DELETE()

    const deleteCalls = mockRun.mock.calls.filter(
      ([sql]: [string]) => sql.toLowerCase().includes('delete from users'),
    )
    expect(deleteCalls).toHaveLength(0)
  })
})

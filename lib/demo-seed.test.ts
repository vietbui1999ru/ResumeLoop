import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('./db-adapter', () => ({ getAdapter: vi.fn() }))
vi.mock('./jd-parser',  () => ({ parseJd:    vi.fn().mockReturnValue({ raw_content: '' }) }))
vi.mock('./fit-scorer', () => ({ scoreJd:    vi.fn().mockReturnValue({ fit_pct: 80, role_track: 'genai', visa_status: 'proceed', action: 'apply' }) }))
vi.mock('bcryptjs',     () => ({ default: { hash: vi.fn().mockResolvedValue('hashed') } }))

import { getAdapter } from './db-adapter'
import { getOrCreateDemoUserForIp, resetDemoUser } from './demo-seed'

const mockGetAdapter = vi.mocked(getAdapter)

function makeMockDb() {
  return {
    queryOne: vi.fn(),
    query:    vi.fn().mockResolvedValue([]),
    run:      vi.fn().mockResolvedValue(undefined),
  }
}

beforeEach(() => { vi.clearAllMocks() })

describe('getOrCreateDemoUserForIp', () => {
  it('returns existing creds without inserting when active demo exists for ip_hash', async () => {
    const mockDb = makeMockDb()
    mockDb.queryOne.mockResolvedValueOnce({ email: 'demo_abc@demo.local', demo_cleartext_pwd: 'secret' })
    mockGetAdapter.mockResolvedValue(mockDb as any)

    const result = await getOrCreateDemoUserForIp('hash-111')

    expect(result).toEqual({ email: 'demo_abc@demo.local', password: 'secret' })
    expect(mockDb.run).not.toHaveBeenCalled()
  })

  it('creates a new user when no active demo exists for ip_hash', async () => {
    const mockDb = makeMockDb()
    mockDb.queryOne.mockResolvedValue(undefined)
    mockGetAdapter.mockResolvedValue(mockDb as any)

    const result = await getOrCreateDemoUserForIp('hash-222')

    expect(result.email).toMatch(/^demo_[0-9a-f-]+@demo\.local$/)
    expect(typeof result.password).toBe('string')
    expect(result.password.length).toBeGreaterThan(0)

    const insertCall = mockDb.run.mock.calls.find(([sql]: [string]) => sql.includes('INSERT INTO users'))
    expect(insertCall).toBeDefined()
    expect(insertCall![1]).toContain('hash-222')
  })

  it('deletes stale expired user before creating fresh', async () => {
    const mockDb = makeMockDb()
    mockDb.queryOne.mockResolvedValueOnce(undefined)         // existing check: miss
    mockDb.queryOne.mockResolvedValueOnce({ id: 'old-id' }) // stale check: hit
    mockGetAdapter.mockResolvedValue(mockDb as any)

    await getOrCreateDemoUserForIp('hash-333')

    const deleteCall = mockDb.run.mock.calls.find(
      ([sql]: [string]) => sql.includes('DELETE FROM users') && sql.includes('id')
    )
    expect(deleteCall).toBeDefined()
    expect(deleteCall![1]).toContain('old-id')
  })
})

describe('resetDemoUser', () => {
  it('deletes old user and creates fresh one with same ip_hash', async () => {
    const mockDb = makeMockDb()
    mockDb.queryOne.mockResolvedValue(undefined)
    mockGetAdapter.mockResolvedValue(mockDb as any)

    const result = await resetDemoUser('old-id', 'hash-444')

    const deleteUsersCall = mockDb.run.mock.calls.find(
      ([sql]: [string]) => sql.includes('DELETE FROM users') && sql.includes('id')
    )
    expect(deleteUsersCall![1]).toContain('old-id')

    const insertCall = mockDb.run.mock.calls.find(([sql]: [string]) => sql.includes('INSERT INTO users'))
    expect(insertCall![1]).toContain('hash-444')

    expect(result.email).toMatch(/^demo_[0-9a-f-]+@demo\.local$/)
    expect(typeof result.password).toBe('string')
  })
})

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('./db-adapter', () => ({ getAdapter: vi.fn() }))
vi.mock('./jd-parser',  () => ({ parseJd:    vi.fn().mockReturnValue({ raw_content: '' }) }))
vi.mock('./fit-scorer', () => ({ scoreJd:    vi.fn().mockReturnValue({ fit_pct: 80, role_track: 'genai', visa_status: 'proceed', action: 'apply' }) }))
vi.mock('bcryptjs',     () => ({ default: { hash: vi.fn().mockResolvedValue('hashed') } }))
vi.mock('./crypto',     () => ({
  encrypt: vi.fn().mockResolvedValue('encrypted:pwd'),
  decrypt: vi.fn().mockImplementation(async (v: string) => v === 'encrypted:pwd' ? 'secret' : v),
}))

import { getAdapter } from './db-adapter'
import { getOrCreateDemoUserForIp, resetDemoUser } from './demo-seed'

const mockGetAdapter = vi.mocked(getAdapter)

function makeMockDb() {
  return {
    queryOne:         vi.fn(),
    query:            vi.fn().mockResolvedValue([]),
    run:              vi.fn().mockResolvedValue(undefined),
    runInTransaction: vi.fn().mockResolvedValue(undefined),
  }
}

beforeEach(() => { vi.clearAllMocks() })

describe('getOrCreateDemoUserForIp', () => {
  it('returns existing creds without inserting when active demo exists for ip_hash', async () => {
    const mockDb = makeMockDb()
    // demo_cleartext_pwd is stored encrypted; mock decrypt returns 'secret' for 'encrypted:pwd'
    mockDb.queryOne.mockResolvedValueOnce({ email: 'demo_abc@demo.local', demo_cleartext_pwd: 'encrypted:pwd' })
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

    // deleteDemoUser uses runInTransaction — check that it was called with the old user id
    expect(mockDb.runInTransaction).toHaveBeenCalledOnce()
    const ops: Array<{ sql: string; params: unknown[] }> = mockDb.runInTransaction.mock.calls[0][0]
    const deleteUsersOp = ops.find(o => o.sql.includes('DELETE FROM users') && o.sql.includes('id'))
    expect(deleteUsersOp?.params).toContain('old-id')
  })
})

describe('resetDemoUser', () => {
  it('deletes old user and creates fresh one with same ip_hash', async () => {
    const mockDb = makeMockDb()
    mockDb.queryOne.mockResolvedValue(undefined)
    mockGetAdapter.mockResolvedValue(mockDb as any)

    const result = await resetDemoUser('old-id', 'hash-444')

    // deleteDemoUser uses runInTransaction — verify the delete included old-id
    expect(mockDb.runInTransaction).toHaveBeenCalledOnce()
    const ops: Array<{ sql: string; params: unknown[] }> = mockDb.runInTransaction.mock.calls[0][0]
    const deleteUsersOp = ops.find(o => o.sql.includes('DELETE FROM users') && o.sql.includes('id'))
    expect(deleteUsersOp?.params).toContain('old-id')

    // INSERT INTO users uses db.run (not transaction)
    const insertCall = mockDb.run.mock.calls.find(([sql]: [string]) => sql.includes('INSERT INTO users'))
    expect(insertCall![1]).toContain('hash-444')

    expect(result.email).toMatch(/^demo_[0-9a-f-]+@demo\.local$/)
    expect(typeof result.password).toBe('string')
  })
})

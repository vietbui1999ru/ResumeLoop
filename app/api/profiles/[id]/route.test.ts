import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/auth',       () => ({ auth: vi.fn() }))
vi.mock('@/lib/db-adapter', () => ({ getAdapter: vi.fn() }))

import { auth }       from '@/lib/auth'
import { getAdapter } from '@/lib/db-adapter'
import { PATCH }      from './route'

const mockAuth       = vi.mocked(auth)
const mockGetAdapter = vi.mocked(getAdapter)

function makeDb(overrides: Partial<{ queryOne: ReturnType<typeof vi.fn>; run: ReturnType<typeof vi.fn>; query: ReturnType<typeof vi.fn> }> = {}) {
  return {
    queryOne: vi.fn(),
    run:      vi.fn().mockResolvedValue(undefined),
    query:    vi.fn().mockResolvedValue([]),
    ...overrides,
  }
}

function makeRequest(body: unknown) {
  return new Request('http://localhost/api/profiles/p-1', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function makeCtx(id = 'p-1') {
  return { params: Promise.resolve({ id }) }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockAuth.mockResolvedValue({ user: { id: 'user-1' } } as any)
})

// ── contact patch ─────────────────────────────────────────────────────────────

describe('PATCH /api/profiles/[id] — contact', () => {
  it('returns 401 when not authenticated', async () => {
    mockAuth.mockResolvedValue(null as any)
    const res = await PATCH(makeRequest({ contact: { name: 'Alice' } }), makeCtx())
    expect(res.status).toBe(401)
  })

  it('returns 404 when profile not found', async () => {
    const db = makeDb({ queryOne: vi.fn().mockResolvedValue(undefined) })
    mockGetAdapter.mockResolvedValue(db as any)
    const res = await PATCH(makeRequest({ contact: { name: 'Alice' } }), makeCtx())
    expect(res.status).toBe(404)
  })

  it('merges contact into existing profile JSON and saves', async () => {
    const existingData = JSON.stringify({ experience: [], contact: { name: 'Old Name', phone: '000' } })
    const db = makeDb({
      queryOne: vi.fn()
        .mockResolvedValueOnce({ id: 'p-1', kind: 'custom' })  // existence check
        .mockResolvedValueOnce({ data: existingData }),          // data fetch
    })
    mockGetAdapter.mockResolvedValue(db as any)

    const newContact = { name: 'Michael Jackson', phone: '555-1234', location: 'Hollywood, CA' }
    const res = await PATCH(makeRequest({ contact: newContact }), makeCtx())

    expect(res.status).toBe(200)

    const updateCall = db.run.mock.calls.find(([sql]: [string]) =>
      sql.includes('UPDATE resume_profiles') && sql.includes('data')
    )
    expect(updateCall).toBeDefined()

    const writtenData = JSON.parse(updateCall![1][0] as string)
    expect(writtenData.contact.name).toBe('Michael Jackson')
    expect(writtenData.contact.phone).toBe('555-1234')
    expect(writtenData.contact.location).toBe('Hollywood, CA')
    // other keys preserved
    expect(writtenData.experience).toEqual([])
  })

  it('creates contact key when profile JSON has none', async () => {
    const existingData = JSON.stringify({ experience: [], projects: [] })
    const db = makeDb({
      queryOne: vi.fn()
        .mockResolvedValueOnce({ id: 'p-1', kind: 'custom' })
        .mockResolvedValueOnce({ data: existingData }),
    })
    mockGetAdapter.mockResolvedValue(db as any)

    const res = await PATCH(makeRequest({ contact: { name: 'Alice' } }), makeCtx())
    expect(res.status).toBe(200)

    const updateCall = db.run.mock.calls.find(([sql]: [string]) =>
      sql.includes('UPDATE resume_profiles') && sql.includes('data')
    )
    const writtenData = JSON.parse(updateCall![1][0] as string)
    expect(writtenData.contact.name).toBe('Alice')
    expect(writtenData.projects).toEqual([])
  })

  it('trims whitespace from contact field values', async () => {
    const existingData = JSON.stringify({})
    const db = makeDb({
      queryOne: vi.fn()
        .mockResolvedValueOnce({ id: 'p-1', kind: 'custom' })
        .mockResolvedValueOnce({ data: existingData }),
    })
    mockGetAdapter.mockResolvedValue(db as any)

    const res = await PATCH(makeRequest({ contact: { name: '  Alice  ', phone: '  555  ' } }), makeCtx())
    expect(res.status).toBe(200)

    const updateCall = db.run.mock.calls.find(([sql]: [string]) =>
      sql.includes('UPDATE resume_profiles') && sql.includes('data')
    )
    const writtenData = JSON.parse(updateCall![1][0] as string)
    expect(writtenData.contact.name).toBe('Alice')
    expect(writtenData.contact.phone).toBe('555')
  })
})

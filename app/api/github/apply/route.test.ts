import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))
vi.mock('@/lib/rate-limit', () => ({ checkRateLimitBucket: vi.fn(() => true) }))
vi.mock('@/lib/sessions', () => ({
  getSession:        vi.fn(),
  updateSessionData: vi.fn(),
}))
vi.mock('@/lib/db-adapter', () => ({ getAdapter: vi.fn() }))

import { auth } from '@/lib/auth'
import { checkRateLimitBucket } from '@/lib/rate-limit'
import { getSession, updateSessionData } from '@/lib/sessions'
import { getAdapter } from '@/lib/db-adapter'
import { POST } from './route'

const mockAuth          = vi.mocked(auth)
const mockRateLimit     = vi.mocked(checkRateLimitBucket)
const mockGetSession    = vi.mocked(getSession)
const mockUpdateSession = vi.mocked(updateSessionData)
const mockGetAdapter    = vi.mocked(getAdapter)

const VALID_PROJECT = {
  id:          'my_project',
  name:        'My Project',
  short_stack: 'TypeScript · React',
  bullets:     ['Built something useful using React and TypeScript achieving great results'],
}

function makeReq(body: unknown): Request {
  return new Request('http://localhost/api/github/apply', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  })
}

describe('POST /api/github/apply', () => {
  let mockDb: { queryOne: ReturnType<typeof vi.fn>; run: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    vi.clearAllMocks()
    mockAuth.mockResolvedValue({ user: { id: 'user-1' } } as never)
    mockRateLimit.mockReturnValue(true)
    mockGetSession.mockResolvedValue({ data: '{}' } as never)
    mockUpdateSession.mockResolvedValue(undefined as never)
    mockDb = {
      queryOne: vi.fn().mockResolvedValue(null),
      run:      vi.fn().mockResolvedValue(undefined),
    }
    mockGetAdapter.mockResolvedValue(mockDb as never)
  })

  // ── Auth ──────────────────────────────────────────────────────────────────

  it('returns 401 when unauthenticated', async () => {
    mockAuth.mockResolvedValue(null as never)
    const res = await POST(makeReq({ project: VALID_PROJECT }))
    expect(res.status).toBe(401)
  })

  // ── Rate limit ────────────────────────────────────────────────────────────

  it('returns 429 when rate limit exceeded', async () => {
    mockRateLimit.mockReturnValue(false)
    const res = await POST(makeReq({ project: VALID_PROJECT }))
    expect(res.status).toBe(429)
  })

  // ── Input validation ──────────────────────────────────────────────────────

  it('returns 400 when project field is absent', async () => {
    const res = await POST(makeReq({}))
    expect(res.status).toBe(400)
  })

  it('returns 400 when project.id is missing', async () => {
    const { id: _id, ...noId } = VALID_PROJECT
    const res = await POST(makeReq({ project: noId }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when project.bullets is empty', async () => {
    const res = await POST(makeReq({ project: { ...VALID_PROJECT, bullets: [] } }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when project.id contains uppercase chars', async () => {
    const res = await POST(makeReq({ project: { ...VALID_PROJECT, id: 'MyProject' } }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/lowercase/i)
  })

  it('returns 400 when project.id exceeds 40 chars', async () => {
    const res = await POST(makeReq({ project: { ...VALID_PROJECT, id: 'a'.repeat(41) } }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when project.name contains control characters', async () => {
    const res = await POST(makeReq({ project: { ...VALID_PROJECT, name: 'Bad\x01Name' } }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/control characters/i)
  })

  it('returns 400 when project.short_stack exceeds 60 chars', async () => {
    const res = await POST(makeReq({ project: { ...VALID_PROJECT, short_stack: 'x'.repeat(61) } }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when a bullet exceeds 116 chars', async () => {
    const longBullet = 'B' + 'x'.repeat(116) // 117 chars
    const res = await POST(makeReq({ project: { ...VALID_PROJECT, bullets: [longBullet] } }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/116/i)
  })

  // ── upsertProject ─────────────────────────────────────────────────────────

  it('returns ok:true replaced:false and writes default session for a new project', async () => {
    mockGetSession.mockResolvedValue({ data: JSON.stringify({ projects: [] }) } as never)
    const res = await POST(makeReq({ project: VALID_PROJECT }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.replaced).toBe(false)
    expect(mockUpdateSession).toHaveBeenCalledWith(
      'default',
      expect.stringContaining('"my_project"'),
      'user-1',
    )
  })

  it('returns replaced:true when project id already exists in the session', async () => {
    const existing = JSON.stringify({
      projects: [{ id: 'my_project', name: 'Old', short_stack: 'Old', bullets: ['old'] }],
    })
    mockGetSession.mockResolvedValue({ data: existing } as never)
    const res = await POST(makeReq({ project: VALID_PROJECT }))
    expect((await res.json()).replaced).toBe(true)
  })

  // ── Active session sync ───────────────────────────────────────────────────

  it('patches active session when sessionId differs from default', async () => {
    mockGetSession
      .mockResolvedValueOnce({ data: '{}' } as never)                          // default
      .mockResolvedValueOnce({ data: JSON.stringify({ projects: [] }) } as never) // active
    const res = await POST(makeReq({ project: VALID_PROJECT, sessionId: 'session-abc' }))
    expect(res.status).toBe(200)
    expect(mockUpdateSession).toHaveBeenCalledTimes(2)
    expect(mockUpdateSession).toHaveBeenCalledWith(
      'session-abc',
      expect.stringContaining('"my_project"'),
      'user-1',
    )
  })

  it('skips active session patch when active session does not exist', async () => {
    mockGetSession
      .mockResolvedValueOnce({ data: '{}' } as never) // default
      .mockResolvedValueOnce(null as never)            // active session missing
    await POST(makeReq({ project: VALID_PROJECT, sessionId: 'session-xyz' }))
    expect(mockUpdateSession).toHaveBeenCalledTimes(1) // only default
  })

  // ── resume_profiles sync ──────────────────────────────────────────────────

  it('patches active resume_profile when one exists', async () => {
    mockDb.queryOne.mockResolvedValue({ id: 'profile-1', data: '{}' })
    await POST(makeReq({ project: VALID_PROJECT }))
    expect(mockDb.run).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE resume_profiles'),
      [expect.stringContaining('"my_project"'), 'profile-1'],
    )
  })

  it('does not call db.run when no active profile exists', async () => {
    mockDb.queryOne.mockResolvedValue(null)
    const res = await POST(makeReq({ project: VALID_PROJECT }))
    expect(res.status).toBe(200)
    expect(mockDb.run).not.toHaveBeenCalled()
  })
})

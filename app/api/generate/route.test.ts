import { describe, it, expect, vi, beforeEach } from 'vitest'
import { POST } from './route'

vi.mock('@/lib/auth', () => ({
  auth: vi.fn(),
}))

vi.mock('@/lib/db-adapter', () => ({
  getAdapter: vi.fn(),
}))

import { auth } from '@/lib/auth'
import { getAdapter } from '@/lib/db-adapter'

const authedSession = { user: { id: 'user-1' } }

function makeReq(body: unknown) {
  return new Request('http://localhost/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', origin: 'http://localhost:3000' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.mocked(auth).mockResolvedValue(authedSession as never)
})

describe('POST /api/generate', () => {
  it('returns 401 when not authenticated', async () => {
    vi.mocked(auth).mockResolvedValueOnce(null as never)
    const res = await POST(makeReq({ jobIds: ['job-1'] }))
    expect(res.status).toBe(401)
  })

  it('returns 400 when jobIds is empty array', async () => {
    const res = await POST(makeReq({ jobIds: [] }))
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toMatch(/non-empty/)
  })

  it('returns 400 when jobIds has > 50 items', async () => {
    const ids = Array.from({ length: 51 }, (_, i) => `job-${i}`)
    const res = await POST(makeReq({ jobIds: ids }))
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toMatch(/max 50/)
  })

  it('returns 400 when a jobId is not found in DB', async () => {
    const queryOne = vi.fn().mockResolvedValue(null)
    vi.mocked(getAdapter).mockResolvedValueOnce({ queryOne, run: vi.fn() } as never)
    const res = await POST(makeReq({ jobIds: ['missing-job'] }))
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toMatch(/Unknown job IDs/)
  })

  it('returns 200 with ok:true when all jobIds are valid', async () => {
    const validProfile = JSON.stringify({
      contact: { name: 'Test User', email: 'test@example.com' },
      experience: [{ id: 'e1', bullets: { genai: ['Built X using Y, delivered Z'] } }],
      projects: [],
    })
    const queryOne = vi.fn().mockImplementation((sql: string) => {
      if (sql.includes('jd_jobs')) return Promise.resolve({ one: 1 })
      if (sql.includes('resume_profiles')) return Promise.resolve({ data: validProfile })
      return Promise.resolve(null)
    })
    vi.mocked(getAdapter).mockResolvedValueOnce({ queryOne, run: vi.fn() } as never)
    const res = await POST(makeReq({ jobIds: ['job-1', 'job-2'] }))
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.ok).toBe(true)
    expect(data.validated).toEqual(['job-1', 'job-2'])
  })

  it('returns 422 when no active resume profile exists', async () => {
    const queryOne = vi.fn().mockImplementation((sql: string) => {
      if (sql.includes('jd_jobs')) return Promise.resolve({ one: 1 })
      return Promise.resolve(null)
    })
    vi.mocked(getAdapter).mockResolvedValueOnce({ queryOne, run: vi.fn() } as never)
    const res = await POST(makeReq({ jobIds: ['job-1'] }))
    expect(res.status).toBe(422)
    const data = await res.json()
    expect(data.error).toMatch(/profile/)
  })

  it('returns 400 when body is missing jobIds field', async () => {
    const res = await POST(makeReq({}))
    expect(res.status).toBe(400)
  })
})

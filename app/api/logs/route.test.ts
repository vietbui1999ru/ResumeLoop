import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/logs-auth', () => ({ checkLogsAuth: vi.fn() }))
vi.mock('@/lib/logs-service', () => ({
  listSummaries: vi.fn(),
  listFull: vi.fn(),
  purgeAll: vi.fn(),
}))
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn().mockReturnValue(true),
  extractIp: vi.fn().mockReturnValue('1.2.3.4'),
}))

import { checkLogsAuth } from '@/lib/logs-auth'
import { listSummaries, listFull, purgeAll } from '@/lib/logs-service'
import { checkRateLimit } from '@/lib/rate-limit'
import { GET, DELETE } from './route'

const mockAuth = vi.mocked(checkLogsAuth)
const mockSummaries = vi.mocked(listSummaries)
const mockFull = vi.mocked(listFull)
const mockPurge = vi.mocked(purgeAll)
const mockRateLimit = vi.mocked(checkRateLimit)

function makeReq(method: string, url: string) {
  return new Request(url, { method })
}

beforeEach(() => {
  vi.clearAllMocks()
  mockAuth.mockResolvedValue(true)
  mockRateLimit.mockReturnValue(true)
})

describe('GET /api/logs', () => {
  it('returns 403 when auth fails', async () => {
    mockAuth.mockResolvedValue(false)
    const res = await GET(makeReq('GET', 'http://localhost/api/logs'))
    expect(res.status).toBe(403)
  })

  it('returns summaries by default', async () => {
    const summary = { id: 'x__2026-05-01T10-00-00', jobId: 'x', company: 'A', role_title: 'B', started_at: '', stage_count: 0 }
    mockSummaries.mockReturnValue([summary])
    const res = await GET(makeReq('GET', 'http://localhost/api/logs'))
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data[0].id).toBe('x__2026-05-01T10-00-00')
    expect(mockSummaries).toHaveBeenCalled()
    expect(mockFull).not.toHaveBeenCalled()
  })

  it('returns full bodies when ?full=true', async () => {
    const log = { jobId: 'x', company: 'A', role_title: 'B', started_at: '', stages: [] }
    mockFull.mockReturnValue([log as never])
    const res = await GET(makeReq('GET', 'http://localhost/api/logs?full=true'))
    expect(res.status).toBe(200)
    expect(mockFull).toHaveBeenCalled()
  })

  it('clamps limit below 1 to 1', async () => {
    mockSummaries.mockReturnValue([])
    await GET(makeReq('GET', 'http://localhost/api/logs?limit=0'))
    expect(mockSummaries).toHaveBeenCalledWith(expect.objectContaining({ limit: 1 }))
  })

  it('clamps limit above 200 to 200', async () => {
    mockSummaries.mockReturnValue([])
    await GET(makeReq('GET', 'http://localhost/api/logs?limit=999'))
    expect(mockSummaries).toHaveBeenCalledWith(expect.objectContaining({ limit: 200 }))
  })
})

describe('DELETE /api/logs', () => {
  it('returns 403 when auth fails', async () => {
    mockAuth.mockResolvedValue(false)
    const res = await DELETE(makeReq('DELETE', 'http://localhost/api/logs'))
    expect(res.status).toBe(403)
  })

  it('returns 429 when rate limited', async () => {
    mockRateLimit.mockReturnValue(false)
    const res = await DELETE(makeReq('DELETE', 'http://localhost/api/logs'))
    expect(res.status).toBe(429)
  })

  it('returns ok:true with deleted count', async () => {
    mockPurge.mockReturnValue(5)
    const res = await DELETE(makeReq('DELETE', 'http://localhost/api/logs'))
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data).toEqual({ ok: true, deleted: 5 })
  })
})

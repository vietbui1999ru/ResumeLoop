import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/logs-auth', () => ({ checkLogsAuth: vi.fn() }))
vi.mock('@/lib/logs-service', () => ({
  getLog: vi.fn(),
  deleteLog: vi.fn(),
}))
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn().mockReturnValue(true),
  extractIp: vi.fn().mockReturnValue('1.2.3.4'),
}))

import { checkLogsAuth } from '@/lib/logs-auth'
import { getLog, deleteLog } from '@/lib/logs-service'
import { checkRateLimit } from '@/lib/rate-limit'
import { GET, DELETE } from './route'

const mockAuth      = vi.mocked(checkLogsAuth)
const mockGetLog    = vi.mocked(getLog)
const mockDeleteLog = vi.mocked(deleteLog)
const mockRateLimit = vi.mocked(checkRateLimit)

const validId = 'acme-swe__2026-05-09T20-53-46'
const sampleLog = { jobId: 'acme-swe', company: 'Acme', role_title: 'SWE', started_at: '', stages: [] }

function makeCtx(id: string) {
  return { params: Promise.resolve({ id }) }
}

function makeReq(method: string) {
  return new Request(`http://localhost/api/logs/${validId}`, { method })
}

beforeEach(() => {
  vi.clearAllMocks()
  mockAuth.mockResolvedValue(true)
  mockRateLimit.mockReturnValue(true)
})

describe('GET /api/logs/[id]', () => {
  it('returns 403 when auth fails', async () => {
    mockAuth.mockResolvedValue(false)
    const res = await GET(makeReq('GET'), makeCtx(validId))
    expect(res.status).toBe(403)
  })

  it('returns full log on valid id', async () => {
    mockGetLog.mockReturnValue(sampleLog as never)
    const res = await GET(makeReq('GET'), makeCtx(validId))
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.company).toBe('Acme')
  })

  it('returns 404 when getLog returns null', async () => {
    mockGetLog.mockReturnValue(null)
    const res = await GET(makeReq('GET'), makeCtx(validId))
    expect(res.status).toBe(404)
  })
})

describe('DELETE /api/logs/[id]', () => {
  it('returns 403 when auth fails', async () => {
    mockAuth.mockResolvedValue(false)
    const res = await DELETE(makeReq('DELETE'), makeCtx(validId))
    expect(res.status).toBe(403)
  })

  it('returns 429 when rate limited', async () => {
    mockRateLimit.mockReturnValue(false)
    const res = await DELETE(makeReq('DELETE'), makeCtx(validId))
    expect(res.status).toBe(429)
  })

  it('returns ok:true on success', async () => {
    mockDeleteLog.mockReturnValue(true)
    const res = await DELETE(makeReq('DELETE'), makeCtx(validId))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
  })

  it('returns 404 when deleteLog returns false', async () => {
    mockDeleteLog.mockReturnValue(false)
    const res = await DELETE(makeReq('DELETE'), makeCtx(validId))
    expect(res.status).toBe(404)
  })
})

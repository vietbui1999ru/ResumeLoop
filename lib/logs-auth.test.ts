import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))
import { auth } from '@/lib/auth'
import { checkLogsAuth } from './logs-auth'

beforeEach(() => {
  vi.mocked(auth).mockResolvedValue(null as never)
  delete process.env.LOGS_API_KEY
})

function makeReq(headers: Record<string, string> = {}) {
  return new Request('http://localhost/api/logs', { headers })
}

describe('checkLogsAuth', () => {
  it('returns true for valid NextAuth session', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'u1' } } as never)
    expect(await checkLogsAuth(makeReq())).toBe(true)
  })

  it('returns false when no session and no key configured', async () => {
    expect(await checkLogsAuth(makeReq())).toBe(false)
  })

  it('returns false when LOGS_API_KEY absent even with Bearer header', async () => {
    const req = makeReq({ authorization: 'Bearer secret' })
    expect(await checkLogsAuth(req)).toBe(false)
  })

  it('returns true when Bearer matches LOGS_API_KEY', async () => {
    process.env.LOGS_API_KEY = 'mysecret'
    const req = makeReq({ authorization: 'Bearer mysecret' })
    expect(await checkLogsAuth(req)).toBe(true)
  })

  it('returns false when Bearer does not match LOGS_API_KEY', async () => {
    process.env.LOGS_API_KEY = 'mysecret'
    const req = makeReq({ authorization: 'Bearer wrongkey' })
    expect(await checkLogsAuth(req)).toBe(false)
  })
})

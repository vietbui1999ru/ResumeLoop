import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ── Mock auth ────────────────────────────────────────────────────────────────
vi.mock('@/lib/auth', () => ({
  auth: vi.fn(),
}))

import { auth } from '@/lib/auth'
import { GET } from './route'

const mockAuth = auth as ReturnType<typeof vi.fn>

function makeReq(searchParams: Record<string, string> = {}): Request {
  const url = new URL('http://localhost/api/settings/ai/ollama-models')
  for (const [k, v] of Object.entries(searchParams)) url.searchParams.set(k, v)
  return new Request(url.toString())
}

describe('GET /api/settings/ai/ollama-models', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  // ── Auth gate ──────────────────────────────────────────────────────────────
  it('returns 401 when not authenticated', async () => {
    mockAuth.mockResolvedValue(null)
    const res = await GET(makeReq())
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.error).toMatch(/unauthorized/i)
  })

  it('returns 401 when session has no user id', async () => {
    mockAuth.mockResolvedValue({ user: {} })
    const res = await GET(makeReq())
    expect(res.status).toBe(401)
  })

  // ── SSRF guard ─────────────────────────────────────────────────────────────
  it('returns 400 for public IP base_url', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'user-1' } })
    const res = await GET(makeReq({ base_url: 'http://8.8.8.8:11434' }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/local|private/i)
  })

  it('returns 400 for cloud metadata base_url', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'user-1' } })
    const res = await GET(makeReq({ base_url: 'http://169.254.169.254' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 for external hostname', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'user-1' } })
    const res = await GET(makeReq({ base_url: 'http://evil.com:11434' }))
    expect(res.status).toBe(400)
  })

  // ── Ollama server unreachable ──────────────────────────────────────────────
  it('returns 502 when Ollama fetch throws ECONNREFUSED', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'user-1' } })
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')))
    const res = await GET(makeReq())
    expect(res.status).toBe(502)
    const body = await res.json()
    expect(body.error).toMatch(/connect|running/i)
  })

  it('returns 502 when Ollama returns non-200', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'user-1' } })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 } as Response))
    const res = await GET(makeReq())
    expect(res.status).toBe(502)
  })

  // ── Happy path ─────────────────────────────────────────────────────────────
  it('returns model list on success with default URL', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'user-1' } })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok:   true,
      json: async () => ({ models: [{ name: 'llama3:latest', model: 'llama3:latest' }] }),
    } as unknown as Response))

    const res = await GET(makeReq())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.models).toEqual(['llama3:latest'])
    // Should hit the /api/tags endpoint (not /v1/api/tags)
    expect((fetch as ReturnType<typeof vi.fn>).mock.calls[0][0]).toMatch(/\/api\/tags$/)
  })

  it('strips /v1 suffix when building /api/tags URL', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'user-1' } })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok:   true,
      json: async () => ({ models: [] }),
    } as unknown as Response))

    await GET(makeReq({ base_url: 'http://localhost:11434/v1' }))
    const calledUrl = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
    expect(calledUrl).toBe('http://localhost:11434/api/tags')
  })

  it('accepts private network base_url', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'user-1' } })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok:   true,
      json: async () => ({ models: [{ name: 'mistral:7b', model: 'mistral:7b' }] }),
    } as unknown as Response))

    const res = await GET(makeReq({ base_url: 'http://192.168.1.100:11434' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.models).toContain('mistral:7b')
  })

  it('handles empty models array gracefully', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'user-1' } })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok:   true,
      json: async () => ({ models: null }),
    } as unknown as Response))

    const res = await GET(makeReq())
    expect(res.status).toBe(200)
    expect((await res.json()).models).toEqual([])
  })
})

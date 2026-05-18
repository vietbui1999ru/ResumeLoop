import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Mock heavy deps before importing the route ────────────────────────────────
vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn(() => true),
  extractIp:      vi.fn(() => '127.0.0.1'),
}))
vi.mock('@/lib/user-settings', () => ({
  PROVIDERS:          ['anthropic', 'openai', 'google', 'groq', 'openrouter', 'ollama'],
  DEFAULT_MODELS:     { anthropic: 'claude-3-5-haiku-20241022', openai: 'gpt-4o-mini', google: 'gemini-1.5-flash', groq: 'llama3-8b-8192', openrouter: 'openai/gpt-4o-mini', ollama: 'llama3' },
  setProviderConfig:  vi.fn(),
  deleteProviderConfig: vi.fn(),
  listProviderHints:  vi.fn(() => []),
  setActiveProvider:  vi.fn(),
  getActiveProvider:  vi.fn(() => null),
  maskKey:            vi.fn((k: string) => `...${k.slice(-4)}`),
}))
vi.mock('@/lib/ai-client', () => ({ buildModel: vi.fn(() => 'mock-model') }))
vi.mock('ai', () => ({ generateText: vi.fn() }))

import { auth } from '@/lib/auth'
import { generateText } from 'ai'
import { setProviderConfig } from '@/lib/user-settings'
import { POST } from './route'

const mockAuth        = auth as ReturnType<typeof vi.fn>
const mockGenerate    = generateText as ReturnType<typeof vi.fn>
const mockSetProvider = setProviderConfig as ReturnType<typeof vi.fn>

function makePostReq(body: object): Request {
  return new Request('http://localhost/api/settings/ai', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  })
}

describe('POST /api/settings/ai — ollama provider', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuth.mockResolvedValue({ user: { id: 'user-1' } })
    mockGenerate.mockResolvedValue({})
    mockSetProvider.mockResolvedValue(undefined)
  })

  // ── Auth gate ──────────────────────────────────────────────────────────────
  it('returns 401 when unauthenticated', async () => {
    mockAuth.mockResolvedValue(null)
    const res = await POST(makePostReq({ provider: 'ollama' }))
    expect(res.status).toBe(401)
  })

  // ── Ollama: no api_key required ────────────────────────────────────────────
  it('accepts ollama provider with no api_key', async () => {
    const res = await POST(makePostReq({ provider: 'ollama' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
  })

  it('stores config when ollama succeeds', async () => {
    await POST(makePostReq({ provider: 'ollama' }))
    expect(mockSetProvider).toHaveBeenCalledWith(
      'user-1',
      'ollama',
      '',                          // empty key for ollama
      expect.any(String),          // model
      'http://localhost:11434/v1', // default base_url
    )
  })

  // ── SSRF guard on base_url ─────────────────────────────────────────────────
  it('returns 400 for public IP base_url', async () => {
    const res = await POST(makePostReq({ provider: 'ollama', base_url: 'http://8.8.8.8:11434' }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/local|private/i)
  })

  it('returns 400 for AWS metadata base_url', async () => {
    const res = await POST(makePostReq({ provider: 'ollama', base_url: 'http://169.254.169.254' }))
    expect(res.status).toBe(400)
  })

  it('accepts private-network base_url', async () => {
    const res = await POST(makePostReq({ provider: 'ollama', base_url: 'http://192.168.1.50:11434/v1' }))
    expect(res.status).toBe(200)
  })

  // ── testKey uses placeholder, not real key ─────────────────────────────────
  it('passes "ollama" placeholder key to generateText, not empty string', async () => {
    const { buildModel } = await import('@/lib/ai-client')
    await POST(makePostReq({ provider: 'ollama' }))
    expect(buildModel).toHaveBeenCalledWith('ollama', 'ollama', expect.any(String), expect.any(String))
  })

  // ── Non-ollama: api_key still required ────────────────────────────────────
  it('returns 400 for anthropic with no api_key', async () => {
    const res = await POST(makePostReq({ provider: 'anthropic' }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/api_key required/i)
  })

  // ── Model name validation ─────────────────────────────────────────────────
  it('returns 400 for model name with shell metacharacters', async () => {
    const res = await POST(makePostReq({ provider: 'ollama', model: 'llama3; rm -rf /' }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/invalid model name/i)
  })
})

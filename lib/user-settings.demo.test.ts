import { describe, it, expect, vi, afterEach } from 'vitest'

// getAdapter must never be reached in demo-public mode — throwing here proves the
// DB is bypassed, not just unused.
vi.mock('./db-adapter', () => ({
  getAdapter: vi.fn(async () => {
    throw new Error('DB must not be consulted in DEMO_PUBLIC mode')
  }),
}))
vi.mock('./crypto', () => ({
  encrypt: vi.fn(async (s: string) => s),
  decrypt: vi.fn(async (s: string) => s),
}))

import { getActiveProvider, getActiveConfig } from './user-settings'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('DEMO_PUBLIC provider forcing', () => {
  it('forces ollama regardless of DB state', async () => {
    vi.stubEnv('DEMO_PUBLIC', '1')
    expect(await getActiveProvider('any-user')).toBe('ollama')
  })

  it('returns the forced ollama config with the repo default model', async () => {
    vi.stubEnv('DEMO_PUBLIC', '1')
    const cfg = await getActiveConfig('any-user')
    expect(cfg).toEqual({
      provider: 'ollama',
      apiKey:   '',
      model:    'gemma4:e2b',
      baseUrl:  'http://localhost:11434/v1',
    })
  })

  it('honors DEMO_OLLAMA_MODEL and DEMO_OLLAMA_BASE_URL overrides', async () => {
    vi.stubEnv('DEMO_PUBLIC', '1')
    vi.stubEnv('DEMO_OLLAMA_MODEL', 'gemma4:e4b')
    vi.stubEnv('DEMO_OLLAMA_BASE_URL', 'http://ollama:11434/v1')
    const cfg = await getActiveConfig('any-user')
    expect(cfg?.model).toBe('gemma4:e4b')
    expect(cfg?.baseUrl).toBe('http://ollama:11434/v1')
  })

  it('falls through to the DB path when DEMO_PUBLIC is unset', async () => {
    await expect(getActiveProvider('any-user')).rejects.toThrow('DB must not be consulted')
  })
})

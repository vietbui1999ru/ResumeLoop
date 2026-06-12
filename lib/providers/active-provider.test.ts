import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  getActiveProviderId, setActiveProviderId, providerConfigPath,
  isSpawnInstalled, listProviders,
} from './active-provider'
import { getRunner, runnerForSpec } from './factory'
import { getSpec } from './registry'

let tmp: string
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rl-prov-'))
  process.env.RESUMELOOP_HOME = tmp
})
afterEach(() => {
  delete process.env.RESUMELOOP_HOME
  fs.rmSync(tmp, { recursive: true, force: true })
})

describe('active-provider persistence', () => {
  it('returns null when nothing is set', () => {
    expect(getActiveProviderId()).toBeNull()
  })

  it('persists and reads back a valid provider id', () => {
    setActiveProviderId('gemini')
    expect(getActiveProviderId()).toBe('gemini')
    expect(fs.existsSync(providerConfigPath())).toBe(true)
  })

  it('rejects an unknown provider id', () => {
    expect(() => setActiveProviderId('telepathy')).toThrow(/Unknown provider/)
  })

  it('treats a persisted-but-now-unknown id as null', () => {
    fs.mkdirSync(path.dirname(providerConfigPath()), { recursive: true })
    fs.writeFileSync(providerConfigPath(), JSON.stringify({ activeProvider: 'gone' }))
    expect(getActiveProviderId()).toBeNull()
  })
})

describe('detection', () => {
  it('detects a real binary on PATH and rejects a fake one', () => {
    expect(isSpawnInstalled('sh')).toBe(true)
    expect(isSpawnInstalled('definitely-not-a-real-binary-xyz')).toBe(false)
  })

  it('listProviders marks the active provider and uses injected fetch for http', async () => {
    setActiveProviderId('claude')
    const fakeFetch = vi.fn(async () => ({ ok: true })) as unknown as typeof fetch
    const list = await listProviders(fakeFetch)
    expect(list.find(p => p.id === 'claude')?.active).toBe(true)
    const ollama = list.find(p => p.id === 'ollama')
    expect(ollama?.transport).toBe('http')
    expect(ollama?.installed).toBe(true) // fake fetch says reachable
  })
})

describe('factory', () => {
  it('builds a runner for each transport without throwing', () => {
    expect(typeof getRunner('claude')).toBe('function')
    expect(typeof getRunner('codex')).toBe('function')
    expect(typeof getRunner('ollama')).toBe('function')
  })

  it('throws for an unknown provider', () => {
    expect(() => getRunner('nope')).toThrow(/Unknown provider/)
  })

  it('runnerForSpec picks http for http specs', () => {
    const spec = getSpec('ollama')!
    expect(typeof runnerForSpec(spec)).toBe('function')
  })
})

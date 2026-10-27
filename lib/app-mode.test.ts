import { describe, it, expect, beforeEach, afterEach } from 'vitest'

const ENV_KEYS = ['APP_MODE', 'DEMO_PUBLIC', 'RESUMELOOP_REQUIRE_AUTH'] as const
let saved: Record<string, string | undefined>

beforeEach(() => {
  saved = Object.fromEntries(ENV_KEYS.map(k => [k, process.env[k]]))
  for (const k of ENV_KEYS) delete process.env[k]
})
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k]
    else process.env[k] = saved[k]
  }
})

describe('isAuthRequired', () => {
  it('is false when none of the three signals are set (local single-user boot)', async () => {
    const { isAuthRequired } = await import('./app-mode')
    expect(isAuthRequired()).toBe(false)
  })

  it('is true when APP_MODE=cloud, independent of the other two', async () => {
    process.env.APP_MODE = 'cloud'
    const { isAuthRequired } = await import('./app-mode')
    expect(isAuthRequired()).toBe(true)
  })

  it('is true when DEMO_PUBLIC=1', async () => {
    process.env.DEMO_PUBLIC = '1'
    const { isAuthRequired } = await import('./app-mode')
    expect(isAuthRequired()).toBe(true)
  })

  it('is true when RESUMELOOP_REQUIRE_AUTH=1 even though isCloud() stays false', async () => {
    process.env.RESUMELOOP_REQUIRE_AUTH = '1'
    const { isAuthRequired, isCloud } = await import('./app-mode')
    expect(isCloud()).toBe(false)
    expect(isAuthRequired()).toBe(true)
  })
})

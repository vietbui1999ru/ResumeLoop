import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { GET, POST } from './route'

let tmp: string
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rl-route-'))
  process.env.RESUMELOOP_HOME = tmp
})
afterEach(() => {
  delete process.env.RESUMELOOP_HOME
  fs.rmSync(tmp, { recursive: true, force: true })
})

describe('GET /api/providers', () => {
  it('returns the provider list', async () => {
    const res = await GET()
    const body = await res.json()
    expect(Array.isArray(body.providers)).toBe(true)
    expect(body.providers.some((p: { id: string }) => p.id === 'claude')).toBe(true)
  })
})

describe('POST /api/providers', () => {
  it('sets a valid provider and reflects it as active', async () => {
    const req = new Request('http://localhost/api/providers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ providerId: 'codex' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.providers.find((p: { id: string }) => p.id === 'codex').active).toBe(true)
  })

  it('400s on a missing providerId', async () => {
    const req = new Request('http://localhost/api/providers', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
    })
    expect((await POST(req)).status).toBe(400)
  })

  it('400s on an unknown providerId', async () => {
    const req = new Request('http://localhost/api/providers', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ providerId: 'nope' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/Unknown provider/)
  })
})

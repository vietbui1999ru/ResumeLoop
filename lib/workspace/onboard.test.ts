import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { validateProvider, setProfileBasics } from './onboard'
import { initWorkspace } from './init'
import { readProfile } from './read'

let root: string
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'rl-onb-'))
  process.env.RESUMELOOP_HOME = root
})
afterEach(() => {
  delete process.env.RESUMELOOP_HOME
  fs.rmSync(root, { recursive: true, force: true })
})

describe('validateProvider', () => {
  it('returns ok when the test spawn round-trips', async () => {
    const runner = vi.fn().mockResolvedValue('```json\n{"ok": true}\n```')
    const r = await validateProvider('claude', { runner })
    expect(r.ok).toBe(true)
    expect(runner).toHaveBeenCalledOnce()
  })

  it('returns a clear error when the provider fails', async () => {
    const runner = vi.fn().mockResolvedValue('the model is confused and returns prose')
    const r = await validateProvider('codex', { runner })
    expect(r.ok).toBe(false)
    expect(r.detail).toMatch(/after retry|no JSON/i)
  })

  it('reports the error (not throws) for an unknown provider id', async () => {
    const r = await validateProvider('telepathy')
    expect(r.ok).toBe(false)
    expect(r.detail).toMatch(/Unknown provider/)
  })
})

describe('setProfileBasics', () => {
  it('writes name/email/location/targets into profile.json', () => {
    initWorkspace(root)
    setProfileBasics(root, {
      name: 'Quoc-Viet Bui', email: 'v@example.com', location: 'Harrisburg, PA',
      targetRoles: ['AI Engineer', 'Backend'],
    })
    const p = readProfile(root) as { contact: Record<string, string>; target_roles: string[] }
    expect(p.contact.name).toBe('Quoc-Viet Bui')
    expect(p.contact.email).toBe('v@example.com')
    expect(p.contact.location).toBe('Harrisburg, PA')
    expect(p.target_roles).toEqual(['AI Engineer', 'Backend'])
  })

  it('merges — preserves existing profile fields and is idempotent', () => {
    initWorkspace(root)
    setProfileBasics(root, { name: 'A', email: 'a@x.com' })
    setProfileBasics(root, { location: 'Remote' }) // second call only sets location
    const p = readProfile(root) as { contact: Record<string, string>; experience: unknown[] }
    expect(p.contact.name).toBe('A')          // preserved from first call
    expect(p.contact.email).toBe('a@x.com')   // preserved
    expect(p.contact.location).toBe('Remote') // added
    expect(p.experience).toEqual([])          // template field untouched
  })
})

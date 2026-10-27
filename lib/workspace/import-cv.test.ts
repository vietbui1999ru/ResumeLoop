import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { extractProfile, applyExtractedProfile, type ExtractedProfile } from './import-cv'
import { initWorkspace } from './init'
import { readProfile } from './read'

let root: string
beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'rl-imp-')) })
afterEach(() => { fs.rmSync(root, { recursive: true, force: true }) })

const sample: ExtractedProfile = {
  experience: [
    { id: 'acme', title: 'Engineer', company: 'Acme', location: 'Remote', dates: '2024', bullets: ['Built X using Go'] },
  ],
  projects: [
    { id: 'proj1', name: 'Proj One', short_stack: 'TS, Next', dates: '2025', url: 'https://x', bullets: ['Shipped it'] },
  ],
  skills: { Languages: 'Go, TypeScript', AI: 'LLMs' },
}

describe('extractProfile', () => {
  it('returns validated structured data from a fenced-JSON response', async () => {
    const runner = vi.fn().mockResolvedValue('```json\n' + JSON.stringify(sample) + '\n```')
    const out = await extractProfile('my CV text', runner)
    expect(out.experience[0].company).toBe('Acme')
    expect(out.projects[0].name).toBe('Proj One')
    expect(out.skills.Languages).toBe('Go, TypeScript')
    expect(String(runner.mock.calls[0][0])).toContain('<cv>')
  })

  it('throws (after retry) when the provider never returns valid JSON', async () => {
    const runner = vi.fn().mockResolvedValue('I could not parse that CV, sorry.')
    await expect(extractProfile('x', runner)).rejects.toThrow(/after retry/i)
    expect(runner).toHaveBeenCalledTimes(2)
  })

  it('fills defaults for omitted optional fields', async () => {
    const minimal = { experience: [{ id: 'a', title: 'T', company: 'C', bullets: ['b'] }], projects: [], skills: {} }
    const runner = vi.fn().mockResolvedValue('```json\n' + JSON.stringify(minimal) + '\n```')
    const out = await extractProfile('x', runner)
    expect(out.experience[0].location).toBe('')
    expect(out.experience[0].dates).toBe('')
  })
})

describe('applyExtractedProfile', () => {
  it('maps into profile.json shape (genai variant) and preserves contact', () => {
    initWorkspace(root)
    // seed a contact to confirm it survives
    const p0 = JSON.parse(fs.readFileSync(path.join(root, 'data', 'profile.json'), 'utf8'))
    p0.contact.name = 'Viet'
    fs.writeFileSync(path.join(root, 'data', 'profile.json'), JSON.stringify(p0))

    applyExtractedProfile(root, sample)
    const p = readProfile(root) as {
      contact: { name: string }
      experience: { id: string; bullets: { genai: string[] } }[]
      projects: { id: string; bullets: string[] }[]
      skills: { genai: Record<string, string> }
    }
    expect(p.contact.name).toBe('Viet')                       // preserved
    expect(p.experience[0].bullets.genai).toEqual(['Built X using Go']) // variant-keyed
    expect(p.projects[0].bullets).toEqual(['Shipped it'])     // flat
    expect(p.skills.genai.Languages).toBe('Go, TypeScript')   // under genai
  })
})

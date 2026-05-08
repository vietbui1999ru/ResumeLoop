import { describe, it, expect, vi } from 'vitest'
import fs from 'fs'

vi.mock('fs')

describe('buildSystemPrompt', () => {
  it('includes master data content in output', async () => {
    vi.mocked(fs.readFileSync).mockImplementation((p: unknown) => {
      if (String(p).includes('master_resume_data')) return '{"experience":[],"projects":[],"skills":{}}'
      if (String(p).includes('CLAUDE-full')) return '## Role-Track Table\n...'
      if (String(p).includes('ats-optimization')) return '## ATS Guidelines\n...'
      return ''
    })
    vi.mocked(fs.existsSync).mockReturnValue(false)

    const { buildSystemPrompt } = await import('./prompt-context')
    const prompt = buildSystemPrompt()

    expect(prompt).toContain('master_resume_data')
    expect(prompt).toContain('Role-Track Table')
    expect(prompt).toContain('ATS Guidelines')
    expect(prompt).toContain('track')
    expect(prompt).toContain('workVariant')
    expect(prompt).toContain('tagline')
    expect(prompt).toContain('skillsRows')
  })

  it('uses synthesized-rules.md when it exists', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true)
    vi.mocked(fs.readFileSync).mockImplementation((p: unknown) => {
      if (String(p).includes('synthesized-rules')) return '## Rule: never use generic taglines'
      return '{}'
    })

    const { buildSystemPrompt } = await import('./prompt-context')
    const prompt = buildSystemPrompt()
    expect(prompt).toContain('never use generic taglines')
  })
})

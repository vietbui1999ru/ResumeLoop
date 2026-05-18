import { describe, it, expect, vi, beforeEach } from 'vitest'
import fs from 'fs'

vi.mock('fs')

// Mock server-only so it doesn't error in test environment
vi.mock('server-only', () => ({}))

// Mock getSystemPrompt (lib/system-prompt.ts) to avoid DB dependency
vi.mock('./system-prompt', () => ({
  getSystemPrompt: vi.fn().mockResolvedValue('## ATS Guidelines\n...\n\n# Role-Track Table\n...'),
}))

// Mock db-adapter to avoid actual DB in test
vi.mock('./db-adapter', () => ({
  getAdapter: vi.fn(),
}))

describe('buildSystemPrompt', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('includes master data content in output', async () => {
    vi.mocked(fs.readFileSync).mockReturnValue('{"experience":[],"projects":[],"skills":{}}' as never)
    vi.mocked(fs.existsSync).mockReturnValue(false)

    // Re-import after mocks are set
    const { getSystemPrompt } = await import('./system-prompt')
    vi.mocked(getSystemPrompt).mockResolvedValue('## ATS Guidelines\nkeyword density\n\n# Role-Track Table\nSoftware Engineer')

    const { buildSystemPrompt } = await import('./prompt-context')
    const prompt = await buildSystemPrompt()

    expect(prompt).toContain('master_resume_data')
    expect(prompt).toContain('ATS Guidelines')
    expect(prompt).toContain('Role-Track Table')
    expect(prompt).toContain('tagline')
    expect(prompt).toContain('workIds')
    expect(prompt).toContain('skillsRows')
  })

  it('does not call fs.readFileSync on docs/reference files', async () => {
    vi.mocked(fs.readFileSync).mockReturnValue('{}' as never)
    vi.mocked(fs.existsSync).mockReturnValue(false)

    const { buildSystemPrompt } = await import('./prompt-context')
    await buildSystemPrompt()

    const calls = vi.mocked(fs.readFileSync).mock.calls.map(c => String(c[0]))
    const leakedRefFiles = calls.filter(p =>
      p.includes('ats-optimization') ||
      p.includes('CLAUDE-full') ||
      p.includes('ats-optimized-resume-system') ||
      p.includes('spec-job-match-resume-generator'),
    )
    expect(leakedRefFiles).toHaveLength(0)
  })

  it('uses synthesized-rules.md when it exists', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true)
    vi.mocked(fs.readFileSync).mockImplementation((p: unknown) => {
      if (String(p).includes('synthesized-rules')) return '## Rule: never use generic taglines' as never
      return '{}' as never
    })

    const { buildSystemPrompt } = await import('./prompt-context')
    const prompt = await buildSystemPrompt()
    expect(prompt).toContain('never use generic taglines')
  })

  it('injects persona_md wrapped in untrusted_content when provided', async () => {
    vi.mocked(fs.readFileSync).mockReturnValue('{}' as never)
    vi.mocked(fs.existsSync).mockReturnValue(false)

    const { buildSystemPrompt } = await import('./prompt-context')
    const prompt = await buildSystemPrompt(undefined, 'I prefer Go roles')

    expect(prompt).toContain('<untrusted_content id="candidate_personalization">')
    expect(prompt).toContain('I prefer Go roles')
    expect(prompt).toContain('ADVISORY ONLY')
  })

  it('omits persona block when persona_md is null', async () => {
    vi.mocked(fs.readFileSync).mockReturnValue('{}' as never)
    vi.mocked(fs.existsSync).mockReturnValue(false)

    const { buildSystemPrompt } = await import('./prompt-context')
    const prompt = await buildSystemPrompt(undefined, null)

    expect(prompt).not.toContain('candidate_personalization')
  })

  it('omits persona block when persona_md is empty string', async () => {
    vi.mocked(fs.readFileSync).mockReturnValue('{}' as never)
    vi.mocked(fs.existsSync).mockReturnValue(false)

    const { buildSystemPrompt } = await import('./prompt-context')
    const prompt = await buildSystemPrompt(undefined, '')

    expect(prompt).not.toContain('candidate_personalization')
  })
})

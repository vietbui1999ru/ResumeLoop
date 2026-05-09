import { describe, it, expect, vi } from 'vitest'

vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: {
      create: vi.fn().mockResolvedValue({
        content: [{
          type: 'tool_use',
          name: 'resume_decision',
          input: {
            track: 'systems',
            workVariant: 'systems',
            workIds: ['gitlab', 'carboncopies', 'udayton'],
            projects: ['homelab', 'eth_switch', 'claude_tui'],
            personaTitle: 'Software Engineer — distributed systems',
            tagline: 'Software Engineer building distributed systems with Go',
            skillsRows: ['Go · Python · Rust', 'React · FastAPI', 'Docker · k8s', 'PostgreSQL · SQLite', 'Prometheus · Grafana'],
            reasoning: '## Track\nSystems track matches.\n## Work Experience\nGo experience.\n## Projects\nHomelab fits.\n## Tagline\nConcise.\n## Skills\nGo dominant.',
          }
        }]
      })
    }
  }))
}))
vi.mock('./prompt-context', () => ({ buildSystemPrompt: () => 'system prompt' }))

describe('reasonForJob', () => {
  it('returns parsed ReasoningResult from tool_use response', async () => {
    const { reasonForJob } = await import('./ai-reason')
    const result = await reasonForJob('JD content here')

    expect(result.track).toBe('systems')
    expect(result.workIds).toHaveLength(3)
    expect(result.projects).toHaveLength(3)
    expect(result.skillsRows).toHaveLength(5)
    expect(result.tagline.length).toBeLessThanOrEqual(76)
  })

  it('throws if workIds length !== 3', async () => {
    const Anthropic = (await import('@anthropic-ai/sdk')).default
    vi.mocked(Anthropic).mockImplementationOnce(() => ({
      messages: {
        create: vi.fn().mockResolvedValue({
          content: [{ type: 'tool_use', name: 'resume_decision', input: { workIds: ['only-one'] } }]
        })
      }
    }) as never)

    const { reasonForJob } = await import('./ai-reason')
    await expect(reasonForJob('jd')).rejects.toThrow('workIds')
  })
})

describe('validateResult — reasoning', () => {
  const base = {
    track: 'genai', workVariant: 'genai',
    workIds: ['gitlab', 'carboncopies', 'udayton'],
    projects: ['ObsidianTasks', 'CalAI', 'MRR Dashboard'],
    personaTitle: 'GenAI Engineer',
    tagline: 'GenAI Engineer building LLM agents',
    skillsRows: ['r1', 'r2', 'r3', 'r4', 'r5'],
  }

  it('throws when reasoning is empty string', async () => {
    const { validateResult } = await import('./ai-reason')
    expect(() => validateResult({ ...base, reasoning: '' })).toThrow('reasoning')
  })

  it('throws when reasoning is missing', async () => {
    const { validateResult } = await import('./ai-reason')
    expect(() => validateResult({ ...base, reasoning: undefined as unknown as string })).toThrow('reasoning')
  })

  it('does not throw when reasoning is present', async () => {
    const { validateResult } = await import('./ai-reason')
    expect(() => validateResult({ ...base, reasoning: '## Track\nsome text' })).not.toThrow()
  })
})

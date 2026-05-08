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

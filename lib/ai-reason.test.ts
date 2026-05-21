import { describe, it, expect, vi } from 'vitest'

// Mock all external deps before importing the module under test
vi.mock('./prompt-context', () => ({ buildSystemPrompt: async () => 'system prompt' }))
vi.mock('./ai-client',      () => ({ getModel: vi.fn().mockResolvedValue({ modelId: 'mock' }) }))
vi.mock('./user-settings',  () => ({ getActiveConfig: vi.fn().mockResolvedValue(null) }))
vi.mock('./ai-usage',       () => ({ logAiUsage: vi.fn().mockResolvedValue(undefined) }))

const GOOD_INPUT = {
  track:        'systems',
  workVariant:  'systems',
  workIds:      ['startup', 'university', 'internship'],
  projects:     ['api_platform', 'llm_assistant', 'infra_dashboard'],
  personaTitle: 'Software Engineer — distributed systems',
  tagline:      'Software Engineer building distributed systems with Go',
  skillsRows:   ['Go · Python · Rust', 'React · FastAPI', 'Docker · k8s', 'PostgreSQL · SQLite', 'Prometheus · Grafana'],
  reasoning:    '## Track\nSystems track.',
}

vi.mock('ai', () => ({
  generateText: vi.fn().mockResolvedValue({
    toolCalls: [{ toolName: 'resume_decision', input: GOOD_INPUT }],
    usage: { inputTokens: 100, outputTokens: 50 },
  }),
  jsonSchema: (s: unknown) => s,
}))

// ── validateResult (pure logic) ───────────────────────────────────────────────

describe('validateResult', () => {
  it('passes on a valid result', async () => {
    const { validateResult } = await import('./ai-reason')
    expect(() => validateResult({ ...GOOD_INPUT })).not.toThrow()
  })

  it('throws if workIds is empty', async () => {
    const { validateResult } = await import('./ai-reason')
    expect(() => validateResult({ ...GOOD_INPUT, workIds: [] })).toThrow('workIds')
  })

  it('throws if projects is empty', async () => {
    const { validateResult } = await import('./ai-reason')
    expect(() => validateResult({ ...GOOD_INPUT, projects: [] })).toThrow('projects')
  })

  it('throws if skillsRows is empty', async () => {
    const { validateResult } = await import('./ai-reason')
    expect(() => validateResult({ ...GOOD_INPUT, skillsRows: [] })).toThrow('skillsRows')
  })

  it('throws if tagline is missing', async () => {
    const { validateResult } = await import('./ai-reason')
    expect(() => validateResult({ ...GOOD_INPUT, tagline: '' })).toThrow('tagline')
  })

  it('throws if personaTitle is missing', async () => {
    const { validateResult } = await import('./ai-reason')
    expect(() => validateResult({ ...GOOD_INPUT, personaTitle: '' })).toThrow('personaTitle')
  })

  it('throws if reasoning is missing', async () => {
    const { validateResult } = await import('./ai-reason')
    expect(() => validateResult({ ...GOOD_INPUT, reasoning: '   ' })).toThrow('reasoning')
  })

  it('auto-trims tagline exceeding 76 chars', async () => {
    const { validateResult } = await import('./ai-reason')
    const r = { ...GOOD_INPUT, tagline: 'A'.repeat(80) }
    validateResult(r)
    expect(r.tagline.length).toBeLessThanOrEqual(76)
  })

  it('auto-trims personaTitle exceeding 60 chars', async () => {
    const { validateResult } = await import('./ai-reason')
    const r = { ...GOOD_INPUT, personaTitle: 'B'.repeat(70) }
    validateResult(r)
    expect(r.personaTitle.length).toBeLessThanOrEqual(60)
  })
})

// ── validateResultAgainstProfile ─────────────────────────────────────────────

describe('validateResultAgainstProfile', () => {
  const makeProfile = (workIds: string[], projectIds: string[]) => JSON.stringify({
    experience: workIds.map(id => ({ id, bullets: { genai: ['B'] } })),
    projects:   projectIds.map(id => ({ id, bullets: ['P'] })),
  })

  it('passes when all IDs exist in profile', async () => {
    const { validateResultAgainstProfile } = await import('./ai-reason')
    const profile = makeProfile(['j1', 'j2'], ['p1', 'p2'])
    expect(() => validateResultAgainstProfile(
      { ...GOOD_INPUT, workIds: ['j1', 'j2'], projects: ['p1'] },
      profile,
    )).not.toThrow()
  })

  it('throws when work ID is unknown', async () => {
    const { validateResultAgainstProfile } = await import('./ai-reason')
    const profile = makeProfile(['j1', 'j2'], ['p1'])
    expect(() => validateResultAgainstProfile(
      { ...GOOD_INPUT, workIds: ['j1', 'ghost'], projects: ['p1'] },
      profile,
    )).toThrow(/unknown work ID.*ghost/)
  })

  it('throws when project ID is unknown', async () => {
    const { validateResultAgainstProfile } = await import('./ai-reason')
    const profile = makeProfile(['j1'], ['p1', 'p2'])
    expect(() => validateResultAgainstProfile(
      { ...GOOD_INPUT, workIds: ['j1'], projects: ['p1', 'phantom'] },
      profile,
    )).toThrow(/unknown project ID.*phantom/)
  })

  it('is a no-op when profile has no experience (enum not enforceable)', async () => {
    const { validateResultAgainstProfile } = await import('./ai-reason')
    const profile = makeProfile([], ['p1'])
    expect(() => validateResultAgainstProfile(
      { ...GOOD_INPUT, workIds: ['any_id'], projects: ['p1'] },
      profile,
    )).not.toThrow()
  })

  it('is a no-op on malformed profile JSON', async () => {
    const { validateResultAgainstProfile } = await import('./ai-reason')
    expect(() => validateResultAgainstProfile(
      { ...GOOD_INPUT, workIds: ['j1'], projects: ['p1'] },
      '{ bad json',
    )).not.toThrow()
  })
})

// ── reasonForJob (mocked AI SDK) ──────────────────────────────────────────────

describe('reasonForJob', () => {
  it('returns parsed ReasoningResult from tool call', async () => {
    const { reasonForJob } = await import('./ai-reason')
    const result = await reasonForJob('JD content here')
    expect(result.track).toBe('systems')
    expect(result.workIds).toHaveLength(3)
    expect(result.projects).toHaveLength(3)
    expect(result.skillsRows).toHaveLength(5)
    expect(result.tagline.length).toBeLessThanOrEqual(76)
  })

  it('throws if no resume_decision tool call returned and no parseable text', async () => {
    const { generateText } = await import('ai')
    vi.mocked(generateText).mockResolvedValueOnce({
      toolCalls: [], text: '', finishReason: 'stop',
      usage: { inputTokens: 0, outputTokens: 0 },
    } as never)
    const { reasonForJob } = await import('./ai-reason')
    await expect(reasonForJob('jd')).rejects.toThrow('No resume_decision')
  })

  it('falls back to JSON text when toolCalls is empty (Gemini text mode)', async () => {
    const { generateText } = await import('ai')
    vi.mocked(generateText).mockResolvedValueOnce({
      toolCalls: [],
      text: JSON.stringify(GOOD_INPUT),
      finishReason: 'stop',
      usage: { inputTokens: 10, outputTokens: 20 },
    } as never)
    const { reasonForJob } = await import('./ai-reason')
    const result = await reasonForJob('jd')
    expect(result.track).toBe('systems')
    expect(result.workIds).toHaveLength(3)
  })

  it('error message includes finishReason and text length on total failure', async () => {
    const { generateText } = await import('ai')
    vi.mocked(generateText).mockResolvedValueOnce({
      toolCalls: [], text: 'not json', finishReason: 'length',
      usage: { inputTokens: 0, outputTokens: 0 },
    } as never)
    const { reasonForJob } = await import('./ai-reason')
    await expect(reasonForJob('jd')).rejects.toThrow('finishReason=length')
  })
})

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('ai', () => ({ generateText: vi.fn(), jsonSchema: (s: unknown) => s }))
vi.mock('../ai-client',     () => ({ getModel: vi.fn().mockReturnValue('mock-model') }))
vi.mock('../user-settings', () => ({ getActiveConfig: vi.fn().mockResolvedValue({ provider: 'anthropic', model: 'claude-sonnet-4-6' }) }))
vi.mock('../ai-usage',      () => ({ logAiUsage: vi.fn().mockResolvedValue(undefined) }))

import { generateText } from 'ai'
import { extractFromPaste } from './extract-paste'

beforeEach(() => { vi.clearAllMocks() })

describe('extractFromPaste', () => {
  it('returns sparse profile from tool call', async () => {
    vi.mocked(generateText).mockResolvedValueOnce({
      toolCalls: [{
        toolName: 'extract_profile',
        input: {
          contact:    { name: 'Jane Doe', email: 'jane@example.com' },
          experience: [{
            id: 'acme', title: 'Engineer', company: 'Acme Corp',
            bullets: { genai: ['Built search pipeline using Elasticsearch, reducing latency 40%'] },
          }],
          projects: [],
        },
      }],
      text: '', finishReason: 'tool-calls',
      usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
    } as never)

    const result = await extractFromPaste(
      'Jane Doe, Engineer at Acme Corp. Built search pipeline using Elasticsearch.',
      'user-1', null,
    )
    expect(result.contact?.name).toBe('Jane Doe')
    expect(result.experience).toHaveLength(1)
    expect(result.experience![0].id).toBe('acme')
  })

  it('throws when AI returns no tool call', async () => {
    vi.mocked(generateText).mockResolvedValueOnce({
      toolCalls: [], text: 'some freeform text',
      finishReason: 'stop',
      usage: { inputTokens: 50, outputTokens: 10, totalTokens: 60 },
    } as never)
    await expect(extractFromPaste('some valid text about a person', 'user-1', null))
      .rejects.toThrow('AI did not call extract_profile tool')
  })

  it('throws when input is too short', async () => {
    await expect(extractFromPaste('hi', 'user-1', null)).rejects.toThrow('too short')
  })
})

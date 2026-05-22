import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('ai', () => ({ generateText: vi.fn(), jsonSchema: (s: unknown) => s }))
vi.mock('../ai-client',     () => ({ getModel: vi.fn().mockReturnValue('mock-model') }))
vi.mock('../user-settings', () => ({ getActiveConfig: vi.fn().mockResolvedValue({ provider: 'anthropic', model: 'claude-sonnet-4-6' }) }))
vi.mock('../ai-usage',      () => ({ logAiUsage: vi.fn().mockResolvedValue(undefined) }))

import { generateText } from 'ai'
import { mergePartials } from './merge'
import type { SparseProfile, IngestionSource } from './types'

beforeEach(() => { vi.clearAllMocks() })

const makeSrc = (id: string, partial: SparseProfile): IngestionSource => ({
  id, userId: 'u1', type: 'paste', inputRaw: '', status: 'done',
  extractedPartial: partial, errorMsg: null, createdAt: 0,
})

describe('mergePartials', () => {
  it('returns merged profile and empty conflicts', async () => {
    vi.mocked(generateText).mockResolvedValueOnce({
      toolCalls: [{ toolName: 'merge_profiles', input: {
        merged: {
          contact:  { name: 'Jane Doe', email: 'jane@example.com' },
          projects: [{ id: 'my-api', name: 'my-api', short_stack: 'Go', bullets: ['Built REST API'] }],
        },
        conflicts: [],
      }}],
      text: '', finishReason: 'tool-calls',
      usage: { inputTokens: 500, outputTokens: 200, totalTokens: 700 },
    } as never)

    const result = await mergePartials([
      makeSrc('s1', { contact: { name: 'Jane Doe', email: 'jane@example.com' } }),
      makeSrc('s2', { projects: [{ id: 'my-api', name: 'my-api', short_stack: 'Go', bullets: ['Built REST API'] }] }),
    ], 'u1')

    expect(result.profile.contact?.name).toBe('Jane Doe')
    expect(result.profile.projects).toHaveLength(1)
    expect(result.conflicts).toHaveLength(0)
  })

  it('surfaces conflicts when AI reports them', async () => {
    vi.mocked(generateText).mockResolvedValueOnce({
      toolCalls: [{ toolName: 'merge_profiles', input: {
        merged:    { contact: { name: 'Jane Doe' } },
        conflicts: [{
          field: 'contact.name',
          description: 'Source 1 says "Jane Doe", source 2 says "J. Doe"',
          sources: [
            { sourceId: 's1', sourceType: 'paste', value: 'Jane Doe' },
            { sourceId: 's2', sourceType: 'url',   value: 'J. Doe' },
          ],
        }],
      }}],
      text: '', finishReason: 'tool-calls',
      usage: { inputTokens: 400, outputTokens: 150, totalTokens: 550 },
    } as never)

    const result = await mergePartials([
      makeSrc('s1', { contact: { name: 'Jane Doe' } }),
      makeSrc('s2', { contact: { name: 'J. Doe' } }),
    ], 'u1')

    expect(result.conflicts).toHaveLength(1)
    expect(result.conflicts[0].field).toBe('contact.name')
  })

  it('skips AI call and returns directly when only one source', async () => {
    const partial: SparseProfile = { contact: { name: 'Solo' } }
    const result = await mergePartials([makeSrc('s1', partial)], 'u1')
    expect(result.profile).toEqual(partial)
    expect(generateText).not.toHaveBeenCalled()
  })

  it('throws when called with zero done sources', async () => {
    await expect(mergePartials([], 'u1')).rejects.toThrow('No extracted sources')
  })
})

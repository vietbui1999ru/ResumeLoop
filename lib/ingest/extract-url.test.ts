import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('ai', () => ({ generateText: vi.fn(), jsonSchema: (s: unknown) => s }))
vi.mock('../ai-client',     () => ({ getModel: vi.fn().mockReturnValue('mock-model') }))
vi.mock('../user-settings', () => ({ getActiveConfig: vi.fn().mockResolvedValue({ provider: 'anthropic', model: 'claude-sonnet-4-6' }) }))
vi.mock('../ai-usage',      () => ({ logAiUsage: vi.fn() }))
vi.mock('../db-adapter', () => ({
  getAdapter: vi.fn().mockResolvedValue({
    queryOne: vi.fn().mockResolvedValue(null),  // no firecrawl key stored
  }),
}))

import { generateText } from 'ai'
import { scrapeUrl, extractFromUrl } from './extract-url'

beforeEach(() => vi.clearAllMocks())

describe('scrapeUrl', () => {
  it('strips HTML when no Firecrawl key', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok:   true,
      text: async () => '<html><body><h1>Jane Doe</h1><p>Software Engineer</p></body></html>',
    } as never)
    const md = await scrapeUrl('https://janedoe.com', null)
    expect(md).toContain('Jane Doe')
    expect(md).not.toContain('<h1>')
  })
})

describe('extractFromUrl', () => {
  it('returns sparse profile from scraped content', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      text: async () => '<html><body>Jane Doe, Engineer. Built distributed systems at Acme Corp.</body></html>',
    } as never)

    vi.mocked(generateText).mockResolvedValueOnce({
      toolCalls: [{ toolName: 'extract_profile', args: {
        contact:    { name: 'Jane Doe', website: 'https://janedoe.com' },
        experience: [{ id: 'acme', company: 'Acme Corp', title: 'Engineer',
                       bullets: { genai: ['Built distributed systems using Go and Kubernetes'] } }],
      }}],
      text: '', finishReason: 'tool-calls',
      usage: { inputTokens: 300, outputTokens: 100, totalTokens: 400 },
    } as never)

    const result = await extractFromUrl('https://janedoe.com', 'user-1')
    expect(result.contact?.name).toBe('Jane Doe')
    expect(result.experience![0].id).toBe('acme')
  })
})

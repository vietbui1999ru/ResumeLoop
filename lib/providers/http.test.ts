import { describe, it, expect, vi } from 'vitest'
import { httpRunner, type FetchFn } from './http'
import type { HttpSpec } from './registry'

const spec: HttpSpec = {
  id: 'ollama', label: 'Ollama', transport: 'http',
  baseUrl: 'http://localhost:11434/v1', model: 'qwen2.5:7b',
}

function okFetch(content: string) {
  return vi.fn(async () => ({
    ok: true,
    json: async () => ({ choices: [{ message: { content } }] }),
  })) as unknown as FetchFn
}

describe('httpRunner', () => {
  it('POSTs an OpenAI-shaped chat request and returns the message content', async () => {
    const fetchFn = okFetch('hello from ollama')
    const out = await httpRunner(spec, fetchFn)('a prompt', { system: 'be terse' })
    expect(out).toBe('hello from ollama')

    const [url, init] = (fetchFn as unknown as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(url).toBe('http://localhost:11434/v1/chat/completions')
    const body = JSON.parse((init as RequestInit).body as string)
    expect(body.model).toBe('qwen2.5:7b')
    expect(body.messages).toEqual([
      { role: 'system', content: 'be terse' },
      { role: 'user', content: 'a prompt' },
    ])
  })

  it('omits the system message when none is provided', async () => {
    const fetchFn = okFetch('x')
    await httpRunner(spec, fetchFn)('just user')
    const body = JSON.parse(
      ((fetchFn as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1] as RequestInit).body as string,
    )
    expect(body.messages).toEqual([{ role: 'user', content: 'just user' }])
  })

  it('throws on a non-ok response', async () => {
    const fetchFn = vi.fn(async () => ({
      ok: false, status: 500, text: async () => 'server boom',
    })) as unknown as FetchFn
    await expect(httpRunner(spec, fetchFn)('x')).rejects.toThrow(/ollama HTTP 500: server boom/)
  })

  it('throws when the response has no content', async () => {
    const fetchFn = vi.fn(async () => ({ ok: true, json: async () => ({ choices: [] }) })) as unknown as FetchFn
    await expect(httpRunner(spec, fetchFn)('x')).rejects.toThrow(/no message content/)
  })
})

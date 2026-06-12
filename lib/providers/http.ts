import type { CliRunner, RunOptions } from './types'
import type { HttpSpec } from './registry'

export type FetchFn = typeof fetch

/**
 * Build a CliRunner that POSTs to an OpenAI-compatible /chat/completions
 * endpoint (e.g. ollama). Powers both local ollama users and the hosted demo,
 * which points at a self-hosted model (ADR 0001 §4). `fetchFn` is injectable.
 */
export function httpRunner(spec: HttpSpec, fetchFn: FetchFn = fetch): CliRunner {
  return async (prompt: string, opts: RunOptions = {}): Promise<string> => {
    const messages: Array<{ role: 'system' | 'user'; content: string }> = []
    if (opts.system) messages.push({ role: 'system', content: opts.system })
    messages.push({ role: 'user', content: prompt })

    const res = await fetchFn(`${spec.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: spec.model, messages, stream: false }),
      signal: opts.signal,
    })

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`${spec.id} HTTP ${res.status}: ${text.slice(0, 300)}`)
    }

    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> }
    const content = data.choices?.[0]?.message?.content
    if (typeof content !== 'string') {
      throw new Error(`${spec.id}: response had no message content`)
    }
    return content
  }
}

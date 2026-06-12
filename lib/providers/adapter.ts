import type { ZodType } from 'zod'
import { extractLastJsonBlock } from './extract-json'
import type { CliRunner, ProviderAdapter, RunOptions } from './types'

/** The instruction appended to every structured prompt to coerce a parseable answer. */
function jsonInstruction(shapeHint?: string): string {
  const shape = shapeHint ? `\n\nThe object must match this shape:\n${shapeHint}` : ''
  return (
    `\n\nReturn ONLY a single fenced JSON code block — no prose, no explanation ` +
    `outside the block. End your message with the block.${shape}\n` +
    '```json\n{ ... }\n```'
  )
}

type Attempt<T> =
  | { ok: true; value: T }
  | { ok: false; error: string; raw: string }

/**
 * Wrap a raw transport in the universal structured-output contract:
 * fenced-JSON instruction → run → extract last block → JSON.parse → Zod →
 * one retry that feeds the error back → throw with diagnostics.
 *
 * This logic lives above the transport, so CLI spawns and HTTP endpoints alike
 * inherit it (ADR 0001 §3).
 */
export function createAdapter(runner: CliRunner): ProviderAdapter {
  return {
    async runStructured<T>(schema: ZodType<T>, prompt: string, opts: RunOptions = {}): Promise<T> {
      const basePrompt = `${prompt}${jsonInstruction(opts.shapeHint)}`

      const attempt = async (p: string): Promise<Attempt<T>> => {
        const raw = await runner(p, opts)
        const extracted = extractLastJsonBlock(raw)
        if (!extracted) return { ok: false, error: 'no JSON block found in output', raw }

        let parsed: unknown
        try {
          parsed = JSON.parse(extracted)
        } catch (e) {
          return { ok: false, error: `JSON.parse failed: ${(e as Error).message}`, raw }
        }

        const result = schema.safeParse(parsed)
        if (!result.success) {
          const detail = result.error.issues
            .map(i => `${i.path.join('.') || '(root)'}: ${i.message}`)
            .join('; ')
          return { ok: false, error: `schema mismatch — ${detail}`, raw }
        }
        return { ok: true, value: result.data }
      }

      const first = await attempt(basePrompt)
      if (first.ok) return first.value

      const retryPrompt =
        `${basePrompt}\n\nYour previous response was invalid: ${first.error}\n` +
        `Return ONLY the corrected JSON block.`
      const second = await attempt(retryPrompt)
      if (second.ok) return second.value

      throw new Error(
        `Provider failed to return valid structured output after retry. ` +
        `Last error: ${second.error}. Raw output (first 300 chars): ${second.raw.slice(0, 300)}`,
      )
    },
  }
}

import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import { parseClaudeEnvelope, claudeRunner } from './claude'
import { createAdapter } from './adapter'

describe('parseClaudeEnvelope', () => {
  it('reads .result from a single result envelope', () => {
    expect(parseClaudeEnvelope('{"type":"result","result":"hello"}')).toBe('hello')
  })

  it('reads the last result event from an array of session events', () => {
    const events = JSON.stringify([
      { type: 'system', subtype: 'init', session_id: 'x' },
      { type: 'assistant', message: {} },
      { type: 'result', result: '```json\n{"a":1}\n```' },
    ])
    expect(parseClaudeEnvelope(events)).toBe('```json\n{"a":1}\n```')
  })

  it('returns raw stdout when it is not JSON', () => {
    expect(parseClaudeEnvelope('plain text answer')).toBe('plain text answer')
  })
})

// Real CLI integration — opt in with RESUMELOOP_E2E_CLAUDE=1 (spawns `claude`, costs a call).
const runE2E = process.env.RESUMELOOP_E2E_CLAUDE === '1'
describe.runIf(runE2E)('claudeRunner (live)', () => {
  it('round-trips a structured object through the real claude CLI', async () => {
    const schema = z.object({ answer: z.number() })
    const adapter = createAdapter(claudeRunner())
    const result = await adapter.runStructured(
      schema,
      'What is 6 times 7? Put the number in the "answer" field.',
      { shapeHint: '{ answer: number }' },
    )
    expect(result.answer).toBe(42)
  }, 120_000)
})

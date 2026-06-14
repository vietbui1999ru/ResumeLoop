import { describe, it, expect, vi } from 'vitest'
import { z } from 'zod'
import { createAdapter } from './adapter'

const FitSchema = z.object({
  fitPct:  z.number().min(0).max(100),
  fitNote: z.string().min(1),
})

describe('createAdapter().runStructured', () => {
  it('parses a clean fenced JSON block on the first attempt', async () => {
    const runner = vi.fn().mockResolvedValue('```json\n{"fitPct":82,"fitNote":"strong match"}\n```')
    const adapter = createAdapter(runner)
    const result = await adapter.runStructured(FitSchema, 'score this JD')
    expect(result).toEqual({ fitPct: 82, fitNote: 'strong match' })
    expect(runner).toHaveBeenCalledTimes(1)
  })

  it('extracts the LAST JSON block when the model thinks out loud first', async () => {
    const runner = vi.fn().mockResolvedValue(
      'let me think:\n```json\n{"fitPct":10,"fitNote":"draft"}\n```\nfinal answer:\n```json\n{"fitPct":90,"fitNote":"final"}\n```',
    )
    const result = await createAdapter(runner).runStructured(FitSchema, 'x')
    expect(result.fitPct).toBe(90)
  })

  it('retries once with the validation error when output is unparseable, then succeeds', async () => {
    const runner = vi.fn()
      .mockResolvedValueOnce('sorry, no json here')
      .mockResolvedValueOnce('```json\n{"fitPct":70,"fitNote":"ok"}\n```')
    const result = await createAdapter(runner).runStructured(FitSchema, 'x')
    expect(result.fitPct).toBe(70)
    expect(runner).toHaveBeenCalledTimes(2)
    // the retry prompt must feed the error back to the model
    expect(String(runner.mock.calls[1][0])).toMatch(/invalid|previous/i)
  })

  it('retries on schema mismatch (valid JSON, wrong shape), then succeeds', async () => {
    const runner = vi.fn()
      .mockResolvedValueOnce('```json\n{"fitPct":"high"}\n```')
      .mockResolvedValueOnce('```json\n{"fitPct":55,"fitNote":"redo"}\n```')
    const result = await createAdapter(runner).runStructured(FitSchema, 'x')
    expect(result.fitPct).toBe(55)
    expect(runner).toHaveBeenCalledTimes(2)
  })

  it('throws with diagnostics after the retry still fails', async () => {
    const runner = vi.fn().mockResolvedValue('never any json')
    await expect(createAdapter(runner).runStructured(FitSchema, 'x')).rejects.toThrow(/after retry/i)
    expect(runner).toHaveBeenCalledTimes(2)
  })

  it('appends the fenced-JSON instruction (and optional shape hint) to the prompt', async () => {
    const runner = vi.fn().mockResolvedValue('```json\n{"fitPct":1,"fitNote":"x"}\n```')
    await createAdapter(runner).runStructured(FitSchema, 'BASE PROMPT', { shapeHint: '{ fitPct, fitNote }' })
    const sent = String(runner.mock.calls[0][0])
    expect(sent).toContain('BASE PROMPT')
    expect(sent).toMatch(/```json/)
    expect(sent).toContain('fitPct, fitNote')
  })
})

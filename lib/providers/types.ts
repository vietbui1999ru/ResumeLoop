import type { ZodType } from 'zod'

/** Options threaded to a runner and through structured calls. */
export interface RunOptions {
  /** System / context prompt prepended ahead of the user prompt. */
  system?: string
  /** Human-readable shape hint appended to the JSON instruction (e.g. "{ fitPct, fitNote }"). */
  shapeHint?: string
  /** Abort the underlying CLI/HTTP call. */
  signal?: AbortSignal
}

/**
 * A transport: takes a fully-built prompt, returns the brain's raw text output.
 * Implementations: spawn a CLI (`claude -p`, `codex exec`, ...) or POST to an
 * OpenAI-compatible endpoint (ollama). Injected so the adapter is unit-testable
 * without a real CLI.
 */
export type CliRunner = (prompt: string, opts?: RunOptions) => Promise<string>

/** The structured-output contract every provider satisfies. */
export interface ProviderAdapter {
  runStructured<T>(schema: ZodType<T>, prompt: string, opts?: RunOptions): Promise<T>
}

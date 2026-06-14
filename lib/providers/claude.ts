import type { CliRunner } from './types'
import type { SpawnSpec } from './registry'
import { spawnRunner } from './spawn'

const CLAUDE_SPEC: SpawnSpec = {
  id: 'claude', label: 'Claude Code', transport: 'spawn',
  bin: 'claude', args: ['-p', '--output-format', 'json'],
  promptVia: 'stdin', envelope: 'claude', nativeJson: true,
}

/**
 * Pull the assistant's answer text out of `claude -p --output-format json`.
 *
 * Observed shapes:
 *  - a single result envelope:  { type: 'result', result: '...' }
 *  - an array of session events: [ {type:'system'...}, ..., {type:'result', result:'...'} ]
 *    (emitted when claude runs nested inside another Claude session)
 *  - anything else → return the raw stdout and let the adapter's extractor cope.
 */
export function parseClaudeEnvelope(stdout: string): string {
  const trimmed = stdout.trim()
  try {
    const parsed = JSON.parse(trimmed)
    const events = Array.isArray(parsed) ? parsed : [parsed]
    for (let i = events.length - 1; i >= 0; i--) {
      const ev = events[i]
      if (ev && typeof ev === 'object' && typeof ev.result === 'string') return ev.result
    }
  } catch {
    /* not JSON — fall through to raw */
  }
  return stdout
}

/**
 * A CliRunner that drives the user's `claude` CLI in headless print mode.
 * Delegates to the generic spawnRunner with the claude envelope parser.
 */
export function claudeRunner(config: { bin?: string } = {}): CliRunner {
  const spec = config.bin ? { ...CLAUDE_SPEC, bin: config.bin } : CLAUDE_SPEC
  return spawnRunner(spec, parseClaudeEnvelope)
}

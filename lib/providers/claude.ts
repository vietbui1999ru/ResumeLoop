import { spawn } from 'node:child_process'
import type { CliRunner, RunOptions } from './types'

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
 * Prompt is written to stdin (no arg-length limits); the JSON envelope's
 * `.result` is returned for the adapter to extract structured output from.
 */
export function claudeRunner(config: { bin?: string } = {}): CliRunner {
  const bin = config.bin ?? 'claude'
  return (prompt: string, opts: RunOptions = {}) =>
    new Promise<string>((resolve, reject) => {
      const child = spawn(bin, ['-p', '--output-format', 'json'], {
        stdio: ['pipe', 'pipe', 'pipe'],
      })

      let stdout = ''
      let stderr = ''
      child.stdout.on('data', d => (stdout += d))
      child.stderr.on('data', d => (stderr += d))
      child.on('error', reject)
      child.on('close', code => {
        if (code !== 0) {
          return reject(new Error(`claude exited ${code}: ${stderr.slice(0, 300) || '(no stderr)'}`))
        }
        resolve(parseClaudeEnvelope(stdout))
      })

      if (opts.signal) {
        opts.signal.addEventListener('abort', () => child.kill(), { once: true })
      }

      const body = opts.system ? `${opts.system}\n\n${prompt}` : prompt
      child.stdin.write(body)
      child.stdin.end()
    })
}

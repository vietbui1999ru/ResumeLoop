import { spawn as nodeSpawn } from 'node:child_process'
import type { CliRunner, RunOptions } from './types'
import type { SpawnSpec } from './registry'

export type SpawnFn = typeof nodeSpawn

/**
 * Build a CliRunner that shells out to a CLI per its spawn spec.
 *
 * Prompt delivery and stdout shape vary per CLI (see config/providers.yml):
 *  - promptVia 'stdin' → pipe the prompt in (claude, codex)
 *  - promptVia 'arg'   → append the prompt as the final arg (gemini -p, opencode run)
 *  - `parse` post-processes stdout (e.g. unwrap claude's JSON envelope).
 *
 * `spawnFn` is injectable so the runner is unit-testable without a real process.
 */
export function spawnRunner(
  spec: SpawnSpec,
  parse: (stdout: string) => string = s => s,
  spawnFn: SpawnFn = nodeSpawn,
): CliRunner {
  return (prompt: string, opts: RunOptions = {}) =>
    new Promise<string>((resolve, reject) => {
      const body = opts.system ? `${opts.system}\n\n${prompt}` : prompt
      const args = spec.promptVia === 'arg' ? [...spec.args, body] : [...spec.args]
      const child = spawnFn(spec.bin, args, { stdio: ['pipe', 'pipe', 'pipe'] })

      let stdout = ''
      let stderr = ''
      child.stdout?.on('data', d => (stdout += d))
      child.stderr?.on('data', d => (stderr += d))
      child.on('error', reject)
      child.on('close', code => {
        if (code !== 0) {
          return reject(new Error(`${spec.bin} exited ${code}: ${stderr.slice(0, 300) || '(no stderr)'}`))
        }
        resolve(parse(stdout))
      })

      if (opts.signal) opts.signal.addEventListener('abort', () => child.kill(), { once: true })

      if (spec.promptVia === 'stdin') {
        child.stdin?.write(body)
        child.stdin?.end()
      } else {
        child.stdin?.end()
      }
    })
}

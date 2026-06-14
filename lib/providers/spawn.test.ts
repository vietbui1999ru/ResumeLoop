import { describe, it, expect, vi } from 'vitest'
import { EventEmitter } from 'node:events'
import { spawnRunner, type SpawnFn } from './spawn'
import type { SpawnSpec } from './registry'

/** A fake child_process.spawn that records its call and emits a scripted result. */
function makeFakeSpawn(opts: { stdout?: string; stderr?: string; code?: number }) {
  const calls: Array<{ bin: string; args: string[] }> = []
  const stdinWrites: string[] = []
  const spawnFn = ((bin: string, args: string[]) => {
    calls.push({ bin, args })
    const child = new EventEmitter() as EventEmitter & Record<string, unknown>
    const stdout = new EventEmitter()
    const stderr = new EventEmitter()
    child.stdout = stdout
    child.stderr = stderr
    child.stdin = { write: (s: string) => stdinWrites.push(s), end: () => {} }
    child.kill = vi.fn()
    setImmediate(() => {
      if (opts.stdout) stdout.emit('data', opts.stdout)
      if (opts.stderr) stderr.emit('data', opts.stderr)
      child.emit('close', opts.code ?? 0)
    })
    return child
  }) as unknown as SpawnFn
  return { spawnFn, calls, stdinWrites }
}

const stdinSpec: SpawnSpec = {
  id: 'codex', label: 'Codex', transport: 'spawn', bin: 'codex',
  args: ['exec', '-'], promptVia: 'stdin', envelope: 'raw', nativeJson: false,
}
const argSpec: SpawnSpec = {
  id: 'gemini', label: 'Gemini', transport: 'spawn', bin: 'gemini',
  args: ['--skip-trust', '-o', 'text', '-p'], promptVia: 'arg', envelope: 'raw', nativeJson: false,
}

describe('spawnRunner', () => {
  it('delivers the prompt via stdin and returns stdout', async () => {
    const fake = makeFakeSpawn({ stdout: 'pong' })
    const out = await spawnRunner(stdinSpec, s => s, fake.spawnFn)('say pong')
    expect(out).toBe('pong')
    expect(fake.calls[0]).toEqual({ bin: 'codex', args: ['exec', '-'] })
    expect(fake.stdinWrites.join('')).toBe('say pong')
  })

  it('delivers the prompt as the final arg when promptVia is "arg"', async () => {
    const fake = makeFakeSpawn({ stdout: 'pong' })
    await spawnRunner(argSpec, s => s, fake.spawnFn)('say pong')
    expect(fake.calls[0].args).toEqual(['--skip-trust', '-o', 'text', '-p', 'say pong'])
    expect(fake.stdinWrites).toHaveLength(0)
  })

  it('prepends the system prompt to the body', async () => {
    const fake = makeFakeSpawn({ stdout: 'ok' })
    await spawnRunner(stdinSpec, s => s, fake.spawnFn)('USER', { system: 'SYS' })
    expect(fake.stdinWrites.join('')).toBe('SYS\n\nUSER')
  })

  it('applies the parse function to stdout', async () => {
    const fake = makeFakeSpawn({ stdout: 'RAW' })
    const out = await spawnRunner(stdinSpec, s => `parsed(${s})`, fake.spawnFn)('x')
    expect(out).toBe('parsed(RAW)')
  })

  it('rejects with stderr on a non-zero exit', async () => {
    const fake = makeFakeSpawn({ stderr: 'boom', code: 1 })
    await expect(spawnRunner(stdinSpec, s => s, fake.spawnFn)('x')).rejects.toThrow(/codex exited 1: boom/)
  })
})

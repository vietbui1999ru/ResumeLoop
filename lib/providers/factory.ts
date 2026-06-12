import type { CliRunner } from './types'
import { getRegistry, getSpec, type ProviderSpec } from './registry'
import { spawnRunner } from './spawn'
import { httpRunner } from './http'
import { parseClaudeEnvelope } from './claude'

/** Build the CliRunner for a given provider spec, choosing the transport. */
export function runnerForSpec(spec: ProviderSpec): CliRunner {
  if (spec.transport === 'http') return httpRunner(spec)
  const parse = spec.envelope === 'claude' ? parseClaudeEnvelope : (s: string) => s
  return spawnRunner(spec, parse)
}

/** Resolve a provider id from the registry to a ready-to-use CliRunner. */
export function getRunner(providerId: string): CliRunner {
  const spec = getSpec(providerId)
  if (!spec) {
    throw new Error(`Unknown provider "${providerId}". Known: ${getRegistry().map(p => p.id).join(', ')}`)
  }
  return runnerForSpec(spec)
}

import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { getRegistry, getSpec } from './registry'

/**
 * Where the active-provider selection is persisted. Forward-compatible with the
 * #79 workspace: defaults to the current dir, overridable via RESUMELOOP_HOME.
 * No API keys are ever stored here — just which brain is selected.
 */
export function configHome(): string {
  return process.env.RESUMELOOP_HOME ?? process.cwd()
}
export function providerConfigPath(): string {
  return path.join(configHome(), '.resumeloop', 'provider.json')
}

/** The selected provider id, or null if unset/unknown. */
export function getActiveProviderId(): string | null {
  try {
    const raw = fs.readFileSync(providerConfigPath(), 'utf8')
    const id = (JSON.parse(raw) as { activeProvider?: string }).activeProvider
    return id && getSpec(id) ? id : null
  } catch {
    return null
  }
}

/** Persist the selected provider id (validated against the registry). */
export function setActiveProviderId(id: string): void {
  if (!getSpec(id)) {
    throw new Error(`Unknown provider "${id}". Known: ${getRegistry().map(p => p.id).join(', ')}`)
  }
  const file = providerConfigPath()
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify({ activeProvider: id }, null, 2) + '\n')
}

/** Is a CLI on PATH? */
export function isSpawnInstalled(bin: string): boolean {
  try {
    return spawnSync('which', [bin]).status === 0
  } catch {
    return false
  }
}

/** Is an OpenAI-compatible endpoint reachable? Pings /models with a short timeout. */
export async function isHttpUp(baseUrl: string, fetchFn: typeof fetch = fetch): Promise<boolean> {
  try {
    const res = await fetchFn(`${baseUrl}/models`, { signal: AbortSignal.timeout(1500) })
    return res.ok
  } catch {
    return false
  }
}

export interface ProviderStatus {
  id: string
  label: string
  transport: 'spawn' | 'http'
  installed: boolean
  active: boolean
}

/** List every registered provider with its install/availability + active state. */
export async function listProviders(fetchFn: typeof fetch = fetch): Promise<ProviderStatus[]> {
  const active = getActiveProviderId()
  return Promise.all(
    getRegistry().map(async (spec): Promise<ProviderStatus> => ({
      id: spec.id,
      label: spec.label,
      transport: spec.transport,
      installed:
        spec.transport === 'spawn' ? isSpawnInstalled(spec.bin) : await isHttpUp(spec.baseUrl, fetchFn),
      active: spec.id === active,
    })),
  )
}

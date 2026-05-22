import path from 'path'
import os from 'os'
import { getAdapter } from './db-adapter'
import { isCloud } from './app-mode'

// Internal keys persisted in DB — all string values
type StoredKey = 'jobs_path' | 'output_path' | 'outreach_path' | 'firecrawl_key'

const DEFAULTS: Record<StoredKey, string> = {
  jobs_path:     process.env.OBSIDIAN_JOBS_PATH ?? path.join(process.cwd(), 'jobs'),
  output_path:   process.env.OUTPUT_PATH        ?? path.join(os.homedir(), 'Desktop', 'Resume Templates'),
  outreach_path: process.env.OUTREACH_PATH      ?? '',
  firecrawl_key: '',
}

// Public shape returned to clients — firecrawl_key is never exposed
export interface AppSettings {
  jobs_path:            string
  output_path:          string
  outreach_path:        string
  firecrawl_configured: boolean
}

// Paths must resolve to one of these roots (prevents writing to ~/.ssh, /etc, etc.)
const SAFE_ROOTS = [
  path.join(os.homedir(), 'Documents'),
  path.join(os.homedir(), 'Desktop'),
  path.join(os.homedir(), 'Downloads'),
  process.cwd(),
]

export function validateSafeDir(raw: string): string {
  // Expand ~ shorthand
  const expanded = raw.startsWith('~/') ? path.join(os.homedir(), raw.slice(2)) : raw
  const resolved = path.resolve(expanded)

  // Reject dotfile-leading path segments (e.g. ~/.ssh)
  const segments = resolved.split(path.sep)
  if (segments.some(s => s.startsWith('.') && s.length > 1)) {
    throw new Error(`Path contains hidden directory: ${resolved}`)
  }

  const allowed = SAFE_ROOTS.some(root => resolved === root || resolved.startsWith(root + path.sep))
  if (!allowed) {
    throw new Error(`Path must be under Documents, Desktop, Downloads, or the project directory. Got: ${resolved}`)
  }

  return resolved
}

export async function getSetting(key: StoredKey): Promise<string> {
  // Cloud has no persistent local filesystem — always use env-based defaults
  if (isCloud()) return DEFAULTS[key]
  const db = await getAdapter()
  const row = await db.queryOne<{ value: string }>(
    'SELECT value FROM app_settings WHERE key = ?',
    [key],
  )
  return row?.value ?? DEFAULTS[key]
}

export async function setSetting(key: StoredKey, value: string): Promise<void> {
  if (isCloud()) return  // No-op in cloud — filesystem paths are meaningless on ECS
  if (value !== '' && key.endsWith('_path')) validateSafeDir(value)
  const db = await getAdapter()
  await db.run(
    'INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    [key, value],
  )
}

// Like validateSafeDir but also allows paths under the configured jobs_path parent (vault root).
// Used by outreach ingest so clipped files anywhere in the vault are accessible.
export async function validateIngestPath(raw: string): Promise<string> {
  const expanded = raw.startsWith('~/') ? path.join(os.homedir(), raw.slice(2)) : raw
  const resolved = path.resolve(expanded)

  const segments = resolved.split(path.sep)
  if (segments.some(s => s.startsWith('.') && s.length > 1)) {
    throw new Error(`Path contains hidden directory: ${resolved}`)
  }

  const standardOk = SAFE_ROOTS.some(r => resolved === r || resolved.startsWith(r + path.sep))
  if (standardOk) return resolved

  const jobsPath = await getSetting('jobs_path')
  const vaultRoot = path.dirname(jobsPath)
  if (resolved === vaultRoot || resolved.startsWith(vaultRoot + path.sep)) return resolved

  throw new Error(`Path must be under Documents, Desktop, Downloads, the project directory, or the configured vault. Got: ${resolved}`)
}

export async function getAllSettings(): Promise<AppSettings> {
  const [jobs_path, output_path, outreach_path, rawFirecrawl] = await Promise.all([
    getSetting('jobs_path'),
    getSetting('output_path'),
    getSetting('outreach_path'),
    getSetting('firecrawl_key'),
  ])
  return { jobs_path, output_path, outreach_path, firecrawl_configured: !!rawFirecrawl?.trim() }
}

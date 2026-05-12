import path from 'path'
import os from 'os'
import { getAdapter } from './db-adapter'

export interface AppSettings {
  jobs_path:     string
  output_path:   string
  outreach_path: string  // optional — empty string = not configured
}

const DEFAULTS: AppSettings = {
  jobs_path:     process.env.OBSIDIAN_JOBS_PATH ?? path.join(process.cwd(), 'jobs'),
  output_path:   process.env.OUTPUT_PATH        ?? path.join(os.homedir(), 'Desktop', 'Resume Templates'),
  outreach_path: process.env.OUTREACH_PATH      ?? '',
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

export async function getSetting<K extends keyof AppSettings>(key: K): Promise<string> {
  const db = await getAdapter()
  const row = await db.queryOne<{ value: string }>(
    'SELECT value FROM app_settings WHERE key = ?',
    [key],
  )
  return row?.value ?? DEFAULTS[key]
}

export async function setSetting<K extends keyof AppSettings>(key: K, value: string): Promise<void> {
  if (value !== '') validateSafeDir(value)  // empty = clear optional setting, skip validation
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
  const [jobs_path, output_path, outreach_path] = await Promise.all([
    getSetting('jobs_path'),
    getSetting('output_path'),
    getSetting('outreach_path'),
  ])
  return { jobs_path, output_path, outreach_path }
}

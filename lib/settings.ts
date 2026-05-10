import path from 'path'
import os from 'os'
import { getDb } from './db'

export interface AppSettings {
  jobs_path: string
  output_path: string
}

const DEFAULTS: AppSettings = {
  jobs_path:   process.env.OBSIDIAN_JOBS_PATH ?? path.join(process.cwd(), 'jobs'),
  output_path: process.env.OUTPUT_PATH        ?? path.join(os.homedir(), 'Desktop', 'Resume Templates'),
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

export function getSetting<K extends keyof AppSettings>(key: K): string {
  const row = getDb().prepare('SELECT value FROM app_settings WHERE key = ?').get(key) as { value: string } | undefined
  return row?.value ?? DEFAULTS[key]
}

export function setSetting<K extends keyof AppSettings>(key: K, value: string): void {
  validateSafeDir(value)  // throws if invalid — caller handles the error
  getDb().prepare('INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .run(key, value)
}

export function getAllSettings(): AppSettings {
  return {
    jobs_path:   getSetting('jobs_path'),
    output_path: getSetting('output_path'),
  }
}

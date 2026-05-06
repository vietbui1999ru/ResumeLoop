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

export function getSetting<K extends keyof AppSettings>(key: K): string {
  const row = getDb().prepare('SELECT value FROM app_settings WHERE key = ?').get(key) as { value: string } | undefined
  return row?.value ?? DEFAULTS[key]
}

export function setSetting<K extends keyof AppSettings>(key: K, value: string): void {
  getDb().prepare('INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .run(key, value)
}

export function getAllSettings(): AppSettings {
  return {
    jobs_path:   getSetting('jobs_path'),
    output_path: getSetting('output_path'),
  }
}

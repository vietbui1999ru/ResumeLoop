import fs from 'node:fs'
import path from 'node:path'
import { parseJd, type JdJob } from '../jd-parser'
import { jobsDir, profilePath } from './paths'

/** Read the canonical profile.json (or null if absent/invalid). */
export function readProfile(root?: string): unknown | null {
  try {
    return JSON.parse(fs.readFileSync(profilePath(root), 'utf8'))
  } catch {
    return null
  }
}

/** Read + parse every job markdown file under data/jobs (skips README/dotfiles). */
export function readJobs(root?: string): JdJob[] {
  const dir = jobsDir(root)
  let entries: string[]
  try {
    entries = fs.readdirSync(dir)
  } catch {
    return [] // workspace not initialized / no jobs yet
  }
  return entries
    .filter(f => f.endsWith('.md') && f.toLowerCase() !== 'readme.md' && !f.startsWith('.'))
    .map(f => {
      const filePath = path.join(dir, f)
      return parseJd(filePath, fs.readFileSync(filePath, 'utf8'))
    })
}

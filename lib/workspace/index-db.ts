import fs from 'node:fs'
import path from 'node:path'
import Database from 'better-sqlite3'
import type { JdJob } from '../jd-parser'
import { indexPath } from './paths'
import { readJobs } from './read'

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS jobs (
    id          TEXT PRIMARY KEY,
    file_path   TEXT NOT NULL,
    company     TEXT,
    role_title  TEXT,
    tags        TEXT,
    visa_status TEXT,
    action      TEXT,
    clipped_at  TEXT,
    apply_url   TEXT,
    hidden      INTEGER NOT NULL DEFAULT 0
  );`

export interface IndexedJob {
  id: string
  file_path: string
  company: string
  role_title: string
  tags: string
  visa_status: string
  action: string | null
  clipped_at: string | null
  apply_url: string | null
  hidden: number
}

/**
 * Rebuild the SQLite index from the canonical job files. Fully idempotent: drops
 * and recreates the table, so deleting the index and reindexing reproduces an
 * identical state (ADR 0001 §2). Returns the number of jobs indexed.
 */
export function reindex(root?: string): { jobs: number } {
  const file = indexPath(root)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const db = new Database(file)
  try {
    db.pragma('journal_mode = WAL')
    db.exec('DROP TABLE IF EXISTS jobs;')
    db.exec(SCHEMA)
    const jobs = readJobs(root)
    const insert = db.prepare(`INSERT INTO jobs
      (id, file_path, company, role_title, tags, visa_status, action, clipped_at, apply_url, hidden)
      VALUES (@id, @file_path, @company, @role_title, @tags, @visa_status, @action, @clipped_at, @apply_url, 0)`)
    const tx = db.transaction((rows: JdJob[]) => {
      for (const r of rows) {
        insert.run({
          id: r.id, file_path: r.file_path, company: r.company, role_title: r.role_title,
          tags: r.tags, visa_status: r.visa_status, action: r.action,
          clipped_at: r.clipped_at, apply_url: r.apply_url,
        })
      }
    })
    tx(jobs)
    return { jobs: jobs.length }
  } finally {
    db.close()
  }
}

/** Read the job list from the index (fast). Empty if the index does not exist yet. */
export function listJobs(root?: string): IndexedJob[] {
  const file = indexPath(root)
  if (!fs.existsSync(file)) return []
  const db = new Database(file, { readonly: true })
  try {
    return db.prepare('SELECT * FROM jobs WHERE hidden = 0 ORDER BY company, role_title').all() as IndexedJob[]
  } finally {
    db.close()
  }
}

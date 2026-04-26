import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'

describe('db schema', () => {
  it('creates jd_jobs with required columns', () => {
    const db = new Database(':memory:')
    db.exec(`
      CREATE TABLE IF NOT EXISTS jd_jobs (
        id TEXT PRIMARY KEY,
        file_path TEXT NOT NULL,
        company TEXT,
        role_title TEXT,
        tags TEXT,
        visa_status TEXT,
        role_track TEXT,
        fit_pct INTEGER,
        raw_content TEXT,
        scanned_at DATETIME
      )
    `)
    const cols = db.prepare('PRAGMA table_info(jd_jobs)').all() as Array<{ name: string }>
    const names = cols.map(c => c.name)
    expect(names).toContain('id')
    expect(names).toContain('fit_pct')
    expect(names).toContain('role_track')
    db.close()
  })
})

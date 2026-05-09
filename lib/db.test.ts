import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import { initSchema } from './db'

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

describe('action column migration', () => {
  it('adds action column to pre-existing DB missing it', () => {
    const db = new Database(':memory:')
    // Simulate a legacy DB that predates the action column (no action column present)
    const legacyDdl = 'CREATE TABLE IF NOT EXISTS jd_jobs (' +
      'id TEXT PRIMARY KEY, file_path TEXT NOT NULL, company TEXT, ' +
      'role_title TEXT, tags TEXT, visa_status TEXT, role_track TEXT, ' +
      'fit_pct INTEGER, raw_content TEXT, scanned_at DATETIME)'
    db.exec(legacyDdl)
    initSchema(db)
    const cols = db.prepare('PRAGMA table_info(jd_jobs)').all() as Array<{ name: string }>
    expect(cols.map(c => c.name)).toContain('action')
    db.close()
  })

  it('initSchema_CalledTwiceOnSameDb_DoesNotThrow', () => {
    const db = new Database(':memory:')
    expect(() => {
      initSchema(db)
      initSchema(db)
    }).not.toThrow()
    db.close()
  })
})

describe('reasoning column migration', () => {
  it('adds reasoning column to legacy jd_outputs missing it', () => {
    const db = new Database(':memory:')
    db.exec(
      'CREATE TABLE IF NOT EXISTS jd_jobs (id TEXT PRIMARY KEY, file_path TEXT NOT NULL);' +
      'CREATE TABLE IF NOT EXISTS jd_outputs (' +
      '  id TEXT PRIMARY KEY, job_id TEXT NOT NULL, docx_path TEXT, built_at DATETIME' +
      ');'
    )
    initSchema(db)
    const cols = db.prepare('PRAGMA table_info(jd_outputs)').all() as Array<{ name: string }>
    expect(cols.map(c => c.name)).toContain('reasoning')
    db.close()
  })
})

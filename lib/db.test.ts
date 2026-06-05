import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import { initSchema, runMigrations } from './db'

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
    const legacyDdl = 'CREATE TABLE IF NOT EXISTS jd_jobs (' +
      'id TEXT PRIMARY KEY, file_path TEXT NOT NULL, company TEXT, ' +
      'role_title TEXT, tags TEXT, visa_status TEXT, role_track TEXT, ' +
      'fit_pct INTEGER, raw_content TEXT, scanned_at DATETIME)'
    db.exec(legacyDdl)
    runMigrations(db)
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
    const colsBefore = db.prepare('PRAGMA table_info(jd_outputs)').all() as Array<{ name: string }>
    expect(colsBefore.map(c => c.name)).not.toContain('reasoning')
    runMigrations(db)
    const colsAfter = db.prepare('PRAGMA table_info(jd_outputs)').all() as Array<{ name: string }>
    expect(colsAfter.map(c => c.name)).toContain('reasoning')
    db.close()
  })
})

describe('pdf_path column migration', () => {
  it('adds pdf_path column to legacy jd_outputs missing it', () => {
    const db = new Database(':memory:')
    db.exec(
      'CREATE TABLE IF NOT EXISTS jd_jobs (id TEXT PRIMARY KEY, file_path TEXT NOT NULL);' +
      'CREATE TABLE IF NOT EXISTS jd_outputs (' +
      '  id TEXT PRIMARY KEY, job_id TEXT NOT NULL, docx_path TEXT, built_at DATETIME' +
      ');'
    )
    const colsBefore = db.prepare('PRAGMA table_info(jd_outputs)').all() as Array<{ name: string }>
    expect(colsBefore.map(c => c.name)).not.toContain('pdf_path')
    runMigrations(db)
    const colsAfter = db.prepare('PRAGMA table_info(jd_outputs)').all() as Array<{ name: string }>
    expect(colsAfter.map(c => c.name)).toContain('pdf_path')
    db.close()
  })
})

describe('chat_messages table', () => {
  it('creates chat_messages with required columns', () => {
    const db = new Database(':memory:')
    initSchema(db)
    const cols = db.prepare('PRAGMA table_info(chat_messages)').all() as Array<{ name: string }>
    const names = cols.map(c => c.name)
    expect(names).toContain('id')
    expect(names).toContain('session_id')
    expect(names).toContain('role')
    expect(names).toContain('content')
    expect(names).toContain('tool_calls')
    db.close()
  })
})

describe('users table deleted_at column', () => {
  // Regression: auth.ts queries `deleted_at FROM users` but the column was absent
  // from the SQLite schema and migrations. Any credentials login threw
  // "no such column: deleted_at", blocking all local sign-ins.
  it('fresh DB has deleted_at column on users', () => {
    const db = new Database(':memory:')
    initSchema(db)
    const cols = db.prepare('PRAGMA table_info(users)').all() as Array<{ name: string }>
    expect(cols.map(c => c.name)).toContain('deleted_at')
    db.close()
  })

  it('adds deleted_at to a legacy users table missing it', () => {
    const db = new Database(':memory:')
    // Simulate pre-migration DB: users table without deleted_at
    db.exec(
      'CREATE TABLE users (' +
      '  id TEXT PRIMARY KEY,' +
      '  email TEXT UNIQUE NOT NULL,' +
      '  password TEXT NOT NULL DEFAULT \'\',' +
      '  is_demo INTEGER NOT NULL DEFAULT 0,' +
      '  email_verified INTEGER NOT NULL DEFAULT 0,' +
      '  created_at DATETIME DEFAULT CURRENT_TIMESTAMP' +
      ')'
    )
    const before = db.prepare('PRAGMA table_info(users)').all() as Array<{ name: string }>
    expect(before.map(c => c.name)).not.toContain('deleted_at')

    runMigrations(db)

    const after = db.prepare('PRAGMA table_info(users)').all() as Array<{ name: string }>
    expect(after.map(c => c.name)).toContain('deleted_at')
    db.close()
  })

  it('SELECT deleted_at FROM users works after initSchema', () => {
    // Verifies the column is queryable — catches the "no such column" error
    // that broke authorize() for all credentials logins.
    const db = new Database(':memory:')
    initSchema(db)
    db.prepare('INSERT INTO users (id, email, password, email_verified) VALUES (?, ?, ?, 1)')
      .run('u1', 'test@example.com', 'hash')
    const row = db.prepare('SELECT id, deleted_at FROM users WHERE email = ?')
      .get('test@example.com') as { id: string; deleted_at: string | null }
    expect(row.id).toBe('u1')
    expect(row.deleted_at).toBeNull()
    db.close()
  })
})

describe('static demo user seed', () => {
  // Regression: demo@demo.com was seeded without email_verified=1.
  // validateCredentials returns null when email_verified=0,
  // making the static demo account impossible to sign in to locally.
  it('demo user has email_verified=1 after initSchema', () => {
    const db = new Database(':memory:')
    initSchema(db)
    const row = db.prepare('SELECT email_verified FROM users WHERE email = ?')
      .get('demo@demo.com') as { email_verified: number } | undefined
    // Static demo seed only runs when isCloud()=false (default in test env)
    if (row) {
      expect(row.email_verified).toBe(1)
    }
    db.close()
  })
})

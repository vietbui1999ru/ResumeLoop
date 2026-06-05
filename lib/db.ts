import Database, { type Database as DB } from 'better-sqlite3'
import fs from 'fs'
import path from 'path'
import { isCloud } from './app-mode'
import { DEFAULT_DB_FILENAME } from './config'

// Global pattern prevents module hot-reload from creating multiple DB connections in Next.js dev mode.
const globalForDb = global as unknown as { _db: DB | undefined }

// Module-level reference kept for non-global environments (e.g. test runners).
let _db: DB | null = null

function hasColumn(db: DB, table: string, column: string): boolean {
  const sql = `SELECT COUNT(*) as c FROM pragma_table_info(?) WHERE name = ?`
  const row = db.prepare(sql).get(table, column) as { c: number }
  return row.c > 0
}

function ensureUserIdColumn(db: DB, table: string): void {
  if (hasColumn(db, table, 'user_id')) return
  const alter = `ALTER TABLE ${table} ADD COLUMN user_id TEXT NOT NULL DEFAULT 'default'`
  db.prepare(alter).run()
}

function hasTable(db: DB, name: string): boolean {
  const row = db.prepare(`SELECT COUNT(*) as c FROM sqlite_master WHERE type='table' AND name=?`).get(name) as { c: number }
  return row.c > 0
}

export function getDb(): DB {
  if (globalForDb._db) { _db = globalForDb._db; return globalForDb._db }
  if (_db) return _db
  let dbPath: string
  if (process.env.DB_PATH) {
    const resolved = path.resolve(process.cwd(), process.env.DB_PATH)
    if (!resolved.startsWith(process.cwd() + path.sep) && resolved !== process.cwd()) {
      throw new Error(`DB_PATH must be within the project directory: ${resolved}`)
    }
    dbPath = resolved
  } else {
    dbPath = path.join(process.cwd(), DEFAULT_DB_FILENAME)
  }
  _db = new Database(dbPath)
  _db.pragma('journal_mode = WAL')
  _db.pragma('foreign_keys = ON')
  runMigrations(_db)
  globalForDb._db = _db
  return _db
}

export function initSchema(db: DB): void {
  // Create migrations tracking table first so it exists for any caller (tests or production)
  db.prepare(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version    INTEGER PRIMARY KEY,
    applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`).run()

  db.exec(`
    CREATE TABLE IF NOT EXISTS jd_jobs (
      id                TEXT PRIMARY KEY,
      file_path         TEXT NOT NULL,
      company           TEXT,
      role_title        TEXT,
      tags              TEXT,
      visa_status       TEXT,
      role_track        TEXT,
      fit_pct           INTEGER,
      raw_content       TEXT,
      file_mtime        TEXT,
      clipped_at        TEXT,
      action            TEXT,
      outreach_brief    TEXT,
      hidden            INTEGER NOT NULL DEFAULT 0,
      apply_url         TEXT,
      application_case  TEXT,
      user_id           TEXT NOT NULL DEFAULT 'default',
      scanned_at        DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS jd_outputs (
      id            TEXT PRIMARY KEY,
      job_id        TEXT NOT NULL REFERENCES jd_jobs(id),
      docx_path     TEXT,
      pdf_path      TEXT,
      projects_used TEXT,
      work_ids_used TEXT,
      variant       TEXT,
      tagline       TEXT,
      reasoning     TEXT,
      cover_letter  TEXT,
      session_id    TEXT,
      user_id       TEXT NOT NULL DEFAULT 'default',
      built_at      DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS jd_metrics (
      computed_at      DATETIME,
      total_jobs       INTEGER,
      visa_kill_count  INTEGER,
      role_track_dist  TEXT,
      fit_dist         TEXT,
      user_id          TEXT NOT NULL DEFAULT 'default'
    );

    CREATE TABLE IF NOT EXISTS app_settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS chat_messages (
      id         TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      role       TEXT NOT NULL,
      content    TEXT,
      tool_calls TEXT,
      user_id    TEXT NOT NULL DEFAULT 'default',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_chat_session ON chat_messages(session_id, created_at);

    CREATE TABLE IF NOT EXISTS resume_sessions (
      id         TEXT PRIMARY KEY,
      name       TEXT NOT NULL,
      data       TEXT NOT NULL DEFAULT '{}',
      user_id    TEXT NOT NULL DEFAULT 'default',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS user_settings (
      user_id       TEXT NOT NULL,
      provider      TEXT NOT NULL,
      encrypted_key TEXT NOT NULL DEFAULT '',
      model         TEXT NOT NULL,
      base_url      TEXT,
      updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id, provider)
    );

    CREATE TABLE IF NOT EXISTS ai_usage_log (
      id         INTEGER PRIMARY KEY,
      user_id    TEXT NOT NULL,
      provider   TEXT NOT NULL,
      model      TEXT NOT NULL,
      feature    TEXT NOT NULL,
      input_tok  INTEGER NOT NULL DEFAULT 0,
      output_tok INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS users (
      id                  TEXT PRIMARY KEY,
      email               TEXT UNIQUE NOT NULL,
      password            TEXT NOT NULL DEFAULT '',
      is_demo             INTEGER NOT NULL DEFAULT 0,
      email_verified      INTEGER NOT NULL DEFAULT 0,
      password_changed_at DATETIME,
      deleted_at          DATETIME,
      created_at          DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS oauth_accounts (
      id                  TEXT PRIMARY KEY,
      user_id             TEXT NOT NULL REFERENCES users(id),
      provider            TEXT NOT NULL,
      provider_account_id TEXT NOT NULL,
      created_at          DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(provider, provider_account_id)
    );
    CREATE INDEX IF NOT EXISTS idx_oauth_provider ON oauth_accounts(provider, provider_account_id);

    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id         TEXT PRIMARY KEY,
      user_id    TEXT NOT NULL REFERENCES users(id),
      token_hash TEXT NOT NULL UNIQUE,
      expires_at DATETIME NOT NULL,
      used       INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS email_verification_tokens (
      id         TEXT PRIMARY KEY,
      user_id    TEXT NOT NULL REFERENCES users(id),
      token_hash TEXT NOT NULL UNIQUE,
      expires_at DATETIME NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS resume_profiles (
      id         TEXT PRIMARY KEY,
      user_id    TEXT NOT NULL,
      name       TEXT NOT NULL,
      data       TEXT NOT NULL,
      is_active  INTEGER NOT NULL DEFAULT 0,
      kind       TEXT NOT NULL DEFAULT 'custom',
      source     TEXT NOT NULL DEFAULT 'upload',
      persona_md TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS outreach_items (
      id             TEXT PRIMARY KEY,
      job_id         TEXT NOT NULL REFERENCES jd_jobs(id),
      user_id        TEXT NOT NULL,
      kind           TEXT NOT NULL DEFAULT 'person',
      raw_markdown   TEXT NOT NULL,
      ai_card        TEXT,
      role           TEXT,
      role_custom    TEXT,
      notes          TEXT,
      email          TEXT,
      status         TEXT NOT NULL DEFAULT 'not_contacted',
      linkedin_draft TEXT,
      email_draft    TEXT,
      source_path    TEXT,
      created_at     TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS system_prompts (
      id         TEXT PRIMARY KEY,
      prompt_key TEXT NOT NULL,
      version    INTEGER NOT NULL DEFAULT 1,
      content    TEXT NOT NULL,
      is_active  INTEGER NOT NULL DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (prompt_key, version)
    );

    CREATE TABLE IF NOT EXISTS ingestion_sources (
      id                TEXT PRIMARY KEY,
      user_id           TEXT NOT NULL,
      type              TEXT NOT NULL CHECK(type IN ('url', 'github', 'paste')),
      input_raw         TEXT NOT NULL,
      status            TEXT NOT NULL DEFAULT 'pending'
                          CHECK(status IN ('pending', 'processing', 'done', 'failed')),
      extracted_partial TEXT,
      error_msg         TEXT,
      created_at        INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE INDEX IF NOT EXISTS idx_ingest_sources_user
      ON ingestion_sources(user_id, created_at DESC);
  `)

  // Seed demo user (pre-hashed bcrypt of 'demo', rounds=10) — local/self-hosted mode only
  if (!isCloud()) {
    const demoExists = (db.prepare(`SELECT COUNT(*) as c FROM users WHERE email = 'demo@demo.com'`).get() as { c: number }).c > 0
    if (!demoExists) db.prepare(`INSERT INTO users (id, email, password, is_demo, email_verified) VALUES (?, ?, ?, 1, 1)`)
      .run('demo-user', 'demo@demo.com', '$2b$10$p/KLnbVfAXylbVN9Eonw/emuhlarCDbTI4P5CZchZET/5zEAd1hmW')
  }

  // Seed system_prompts from disk files if table is empty (local dev only)
  // In production, content is seeded via NeonAdapter.initialize() or a one-time migration.
  seedSystemPromptsFromDisk(db)

  // Record migration 001 as applied
  db.prepare(`INSERT INTO schema_migrations (version) VALUES (?) ON CONFLICT DO NOTHING`).run(1)
}

/**
 * Run all pending numbered migrations against the given DB.
 *
 * Designed to run as a one-shot ECS task before the application starts.
 * See docs/ops/MIGRATIONS.md for how to trigger a migration run on ECS.
 *
 * Migration 001 = initSchema (full baseline CREATE TABLE IF NOT EXISTS + seeds).
 * Migration 002 = rename demo_cleartext_pwd -> demo_encrypted_pwd (inline TypeScript).
 * Migration 003 = all historical ALTER TABLE / CREATE TABLE additions (inline TypeScript).
 * Migration NNN (NNN > 3) = SQL files in lib/migrations/ matching NNN_*.sql.
 */
export function runMigrations(db: DB): void {
  initSchema(db) // ensures schema_migrations table + migration 001

  const applied = new Set(
    (db.prepare('SELECT version FROM schema_migrations').all() as { version: number }[]).map(r => r.version)
  )

  // 002: rename demo_cleartext_pwd -> demo_encrypted_pwd
  // Column name was misleading — value is AES-256-GCM encrypted, not cleartext.
  if (!applied.has(2)) {
    if (hasColumn(db, 'users', 'demo_cleartext_pwd')) {
      db.exec(`ALTER TABLE users RENAME COLUMN demo_cleartext_pwd TO demo_encrypted_pwd`)
    }
    db.prepare(`INSERT INTO schema_migrations (version) VALUES (?)`).run(2)
    applied.add(2)
  }

  // 003: all historical column/table additions that previously lived in initSchema.
  // SQLite before 3.37.0 lacks ADD COLUMN IF NOT EXISTS, so each addition is
  // guarded by a hasColumn / hasTable check — making the migration idempotent.
  if (!applied.has(3)) {
    applyMigration003(db)
    db.prepare(`INSERT INTO schema_migrations (version) VALUES (?)`).run(3)
    applied.add(3)
  }

  // Generic SQL file loader: runs lib/migrations/NNN_*.sql for NNN > 3.
  // Each file is executed once and recorded in schema_migrations.
  const migrationsDir = path.join(__dirname, 'migrations')
  if (fs.existsSync(migrationsDir)) {
    const sqlFiles = fs.readdirSync(migrationsDir)
      .filter(f => /^\d{3}_.*\.sql$/.test(f))
      .sort()
    for (const file of sqlFiles) {
      const version = parseInt(file.slice(0, 3), 10)
      if (version <= 3) continue // 001-003 handled above
      if (applied.has(version)) continue
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8')
      db.exec(sql)
      db.prepare(`INSERT INTO schema_migrations (version) VALUES (?)`).run(version)
      applied.add(version)
    }
  }
}

/**
 * Migration 003 body: all historical pragma_table_info / sqlite_master checks
 * that were previously inlined in initSchema.
 * Extracted here so runMigrations stays readable and the logic is tested via
 * the existing initSchema integration tests (which call runMigrations).
 */
function applyMigration003(db: DB): void {
  if (!hasColumn(db, 'jd_outputs', 'session_id'))
    db.exec(`ALTER TABLE jd_outputs ADD COLUMN session_id TEXT`)

  if (!hasColumn(db, 'jd_jobs', 'file_mtime'))
    db.exec(`ALTER TABLE jd_jobs ADD COLUMN file_mtime TEXT`)

  if (!hasColumn(db, 'jd_jobs', 'action'))
    db.exec(`ALTER TABLE jd_jobs ADD COLUMN action TEXT`)

  if (!hasColumn(db, 'jd_outputs', 'reasoning'))
    db.exec(`ALTER TABLE jd_outputs ADD COLUMN reasoning TEXT`)

  if (!hasColumn(db, 'jd_outputs', 'pdf_path'))
    db.exec(`ALTER TABLE jd_outputs ADD COLUMN pdf_path TEXT`)

  if (!hasColumn(db, 'jd_outputs', 'cover_letter'))
    db.exec(`ALTER TABLE jd_outputs ADD COLUMN cover_letter TEXT`)

  if (!hasTable(db, 'user_settings')) db.exec(`
    CREATE TABLE user_settings (
      user_id       TEXT NOT NULL,
      provider      TEXT NOT NULL,
      encrypted_key TEXT NOT NULL DEFAULT '',
      model         TEXT NOT NULL,
      base_url      TEXT,
      updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id, provider)
    )
  `)

  if (!hasTable(db, 'ai_usage_log')) db.exec(`
    CREATE TABLE ai_usage_log (
      id         INTEGER PRIMARY KEY,
      user_id    TEXT NOT NULL,
      provider   TEXT NOT NULL,
      model      TEXT NOT NULL,
      feature    TEXT NOT NULL,
      input_tok  INTEGER NOT NULL DEFAULT 0,
      output_tok INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `)

  if (!hasTable(db, 'users')) db.exec(`
    CREATE TABLE users (
      id         TEXT PRIMARY KEY,
      email      TEXT UNIQUE NOT NULL,
      password   TEXT NOT NULL,
      is_demo    INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `)

  if (!hasColumn(db, 'jd_jobs', 'outreach_brief'))
    db.exec(`ALTER TABLE jd_jobs ADD COLUMN outreach_brief TEXT`)

  if (!hasColumn(db, 'jd_jobs', 'clipped_at'))
    db.exec(`ALTER TABLE jd_jobs ADD COLUMN clipped_at TEXT`)

  if (!hasColumn(db, 'jd_jobs', 'hidden'))
    db.exec(`ALTER TABLE jd_jobs ADD COLUMN hidden INTEGER NOT NULL DEFAULT 0`)

  if (!hasColumn(db, 'jd_jobs', 'apply_url'))
    db.exec(`ALTER TABLE jd_jobs ADD COLUMN apply_url TEXT`)

  if (!hasColumn(db, 'jd_jobs', 'application_case'))
    db.exec(`ALTER TABLE jd_jobs ADD COLUMN application_case TEXT`)

  if (!hasTable(db, 'outreach_items')) db.exec(`
    CREATE TABLE outreach_items (
      id             TEXT PRIMARY KEY,
      job_id         TEXT NOT NULL REFERENCES jd_jobs(id),
      user_id        TEXT NOT NULL,
      kind           TEXT NOT NULL DEFAULT 'person',
      raw_markdown   TEXT NOT NULL,
      ai_card        TEXT,
      role           TEXT,
      role_custom    TEXT,
      notes          TEXT,
      email          TEXT,
      status         TEXT NOT NULL DEFAULT 'not_contacted',
      linkedin_draft TEXT,
      email_draft    TEXT,
      source_path    TEXT,
      created_at     TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)

  if (!hasTable(db, 'resume_profiles')) db.exec(`
    CREATE TABLE resume_profiles (
      id         TEXT PRIMARY KEY,
      user_id    TEXT NOT NULL,
      name       TEXT NOT NULL,
      data       TEXT NOT NULL,
      is_active  INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `)

  for (const table of ['jd_jobs', 'jd_outputs', 'jd_metrics', 'chat_messages', 'resume_sessions']) {
    ensureUserIdColumn(db, table)
  }

  // FTS5 for full-text search on company / role / raw content
  // Only create if the source columns exist (guards against legacy-schema migration tests)
  const hasFts = hasTable(db, 'jd_jobs_fts')
  const ftsColumnsExist = hasColumn(db, 'jd_jobs', 'company') && hasColumn(db, 'jd_jobs', 'raw_content')
  if (!hasFts && ftsColumnsExist) {
    db.exec(`
      CREATE VIRTUAL TABLE jd_jobs_fts USING fts5(
        company, role_title, raw_content,
        content='jd_jobs', content_rowid='rowid'
      );
      INSERT INTO jd_jobs_fts(jd_jobs_fts) VALUES ('rebuild');

      CREATE TRIGGER jd_jobs_ai AFTER INSERT ON jd_jobs BEGIN
        INSERT INTO jd_jobs_fts(rowid, company, role_title, raw_content)
        VALUES (new.rowid, new.company, new.role_title, new.raw_content);
      END;
      CREATE TRIGGER jd_jobs_ad AFTER DELETE ON jd_jobs BEGIN
        INSERT INTO jd_jobs_fts(jd_jobs_fts, rowid, company, role_title, raw_content)
        VALUES ('delete', old.rowid, old.company, old.role_title, old.raw_content);
      END;
      CREATE TRIGGER jd_jobs_au AFTER UPDATE ON jd_jobs BEGIN
        INSERT INTO jd_jobs_fts(jd_jobs_fts, rowid, company, role_title, raw_content)
        VALUES ('delete', old.rowid, old.company, old.role_title, old.raw_content);
        INSERT INTO jd_jobs_fts(rowid, company, role_title, raw_content)
        VALUES (new.rowid, new.company, new.role_title, new.raw_content);
      END;
    `)
  }

  // Indexes for filter queries — guarded by column existence for legacy migration tests
  if (hasColumn(db, 'jd_jobs', 'hidden') && hasColumn(db, 'jd_jobs', 'clipped_at'))
    db.exec(`CREATE INDEX IF NOT EXISTS idx_jobs_user_hidden_clipped ON jd_jobs(user_id, hidden, clipped_at DESC)`)
  if (hasColumn(db, 'jd_jobs', 'fit_pct'))
    db.exec(`CREATE INDEX IF NOT EXISTS idx_jobs_user_fitpct ON jd_jobs(user_id, fit_pct)`)
  if (hasColumn(db, 'jd_outputs', 'job_id'))
    db.exec(`CREATE INDEX IF NOT EXISTS idx_outputs_job ON jd_outputs(job_id)`)

  if (!hasColumn(db, 'users', 'email_verified')) {
    db.exec(`ALTER TABLE users ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 0`)
    // Pre-existing demo user gets email_verified=0 from the DEFAULT — fix it now.
    db.exec(`UPDATE users SET email_verified = 1 WHERE is_demo = 1`)
  }
  if (!hasColumn(db, 'users', 'password_changed_at'))
    db.exec(`ALTER TABLE users ADD COLUMN password_changed_at DATETIME`)
  if (!hasColumn(db, 'users', 'deleted_at'))
    db.exec(`ALTER TABLE users ADD COLUMN deleted_at DATETIME`)
  if (!hasColumn(db, 'users', 'ip_hash'))
    db.exec(`ALTER TABLE users ADD COLUMN ip_hash TEXT`)
  // Add demo_encrypted_pwd only when neither pwd column exists; migration 002 renames the old one
  if (!hasColumn(db, 'users', 'demo_encrypted_pwd') && !hasColumn(db, 'users', 'demo_cleartext_pwd'))
    db.exec(`ALTER TABLE users ADD COLUMN demo_encrypted_pwd TEXT`)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_users_ip_hash ON users(ip_hash) WHERE is_demo = 1`)

  if (!hasTable(db, 'oauth_accounts')) db.exec(`
    CREATE TABLE oauth_accounts (
      id                  TEXT PRIMARY KEY,
      user_id             TEXT NOT NULL REFERENCES users(id),
      provider            TEXT NOT NULL,
      provider_account_id TEXT NOT NULL,
      created_at          DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(provider, provider_account_id)
    );
    CREATE INDEX IF NOT EXISTS idx_oauth_provider ON oauth_accounts(provider, provider_account_id);
  `)

  if (!hasTable(db, 'password_reset_tokens')) db.exec(`
    CREATE TABLE password_reset_tokens (
      id         TEXT PRIMARY KEY,
      user_id    TEXT NOT NULL REFERENCES users(id),
      token_hash TEXT NOT NULL UNIQUE,
      expires_at DATETIME NOT NULL,
      used       INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `)

  if (!hasTable(db, 'email_verification_tokens')) db.exec(`
    CREATE TABLE email_verification_tokens (
      id         TEXT PRIMARY KEY,
      user_id    TEXT NOT NULL REFERENCES users(id),
      token_hash TEXT NOT NULL UNIQUE,
      expires_at DATETIME NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `)

  if (!hasTable(db, 'system_prompts')) db.exec(`
    CREATE TABLE system_prompts (
      id         TEXT PRIMARY KEY,
      prompt_key TEXT NOT NULL,
      version    INTEGER NOT NULL DEFAULT 1,
      content    TEXT NOT NULL,
      is_active  INTEGER NOT NULL DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (prompt_key, version)
    )
  `)

  if (!hasColumn(db, 'resume_profiles', 'kind'))
    db.exec(`ALTER TABLE resume_profiles ADD COLUMN kind TEXT NOT NULL DEFAULT 'custom'`)
  if (!hasColumn(db, 'resume_profiles', 'source'))
    db.exec(`ALTER TABLE resume_profiles ADD COLUMN source TEXT NOT NULL DEFAULT 'upload'`)
  if (!hasColumn(db, 'resume_profiles', 'persona_md'))
    db.exec(`ALTER TABLE resume_profiles ADD COLUMN persona_md TEXT`)
  if (!hasColumn(db, 'resume_profiles', 'updated_at'))
    db.exec(`ALTER TABLE resume_profiles ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP`)

  // One-time cleanup: orphaned jd_outputs rows whose job has been deleted.
  // These can block demo-user job deletion via FK. Safe to run every time — deletes nothing if clean.
  db.exec(`DELETE FROM jd_outputs WHERE job_id NOT IN (SELECT id FROM jd_jobs)`)
}

// Seed system_prompts from disk files when the table is empty.
// Skips silently if any rows already exist (already seeded) or if files are missing (production).
function seedSystemPromptsFromDisk(db: DB): void {
  const count = (db.prepare(`SELECT COUNT(*) as c FROM system_prompts`).get() as { c: number }).c
  if (count > 0) return

  const ROOT = process.cwd()

  function tryRead(filePath: string): string {
    try { return fs.readFileSync(filePath, 'utf8') } catch { return '' }
  }

  const atsGuidelines = tryRead(path.join(ROOT, 'docs', 'reference', 'ats-optimization-guidelines.md'))
  const claudeFull    = tryRead(path.join(ROOT, 'docs', 'reference', 'CLAUDE-full.md'))
  const atsSystem     = tryRead(path.join(ROOT, 'docs', 'reference', 'ats-optimized-resume-system.md'))
  const spec          = tryRead(path.join(ROOT, 'docs', 'reference', 'spec-job-match-resume-generator.md'))

  // 'reason' = ats-optimization-guidelines + CLAUDE-full (mirrors buildSystemPrompt() read order)
  const reasonContent      = [atsGuidelines, claudeFull].filter(Boolean).join('\n\n')
  // 'chat'   = ats-optimized-resume-system + spec-job-match-resume-generator
  const chatContent        = [atsSystem, spec].filter(Boolean).join('\n\n')
  // 'cover-letter' has no external file — buildPrompt() in cover-letter.ts is self-contained.
  const coverLetterContent = '# Cover letter prompt is assembled dynamically in lib/cover-letter.ts'

  const insert = db.prepare(
    `INSERT INTO system_prompts (id, prompt_key, version, content, is_active) VALUES (?, ?, ?, ?, ?) ON CONFLICT DO NOTHING`
  )

  if (reasonContent)   insert.run('sp-reason-v1',       'reason',       1, reasonContent,      1)
  if (chatContent)     insert.run('sp-chat-v1',          'chat',         1, chatContent,        1)
  insert.run('sp-cover-letter-v1', 'cover-letter', 1, coverLetterContent, 1)
}

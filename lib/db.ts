import Database, { type Database as DB } from 'better-sqlite3'
import fs from 'fs'
import path from 'path'
import { isCloud } from './app-mode'

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


export function getDb(): DB {
  if (globalForDb._db) { _db = globalForDb._db; return globalForDb._db }
  if (_db) return _db
  const dbPath = process.env.DB_PATH
    ? path.resolve(process.cwd(), process.env.DB_PATH)
    : path.join(process.cwd(), 'resume.db')
  _db = new Database(dbPath)
  _db.pragma('journal_mode = WAL')
  _db.pragma('foreign_keys = ON')
  initSchema(_db)
  globalForDb._db = _db
  return _db
}

export function initSchema(db: DB): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS jd_jobs (
      id             TEXT PRIMARY KEY,
      file_path      TEXT NOT NULL,
      company        TEXT,
      role_title     TEXT,
      tags           TEXT,
      visa_status    TEXT,
      role_track     TEXT,
      fit_pct        INTEGER,
      raw_content    TEXT,
      file_mtime     TEXT,
      clipped_at     TEXT,
      outreach_brief TEXT,
      hidden         INTEGER NOT NULL DEFAULT 0,
      apply_url      TEXT,
      user_id        TEXT NOT NULL DEFAULT 'default',
      scanned_at     DATETIME DEFAULT CURRENT_TIMESTAMP
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
  `)

  // Migrate existing DBs that predate session_id column on jd_outputs
  const hasSessionId = (db.prepare(`SELECT COUNT(*) as c FROM pragma_table_info('jd_outputs') WHERE name='session_id'`).get() as { c: number }).c > 0
  if (!hasSessionId) db.exec(`ALTER TABLE jd_outputs ADD COLUMN session_id TEXT`)

  // Migrate existing DBs that predate file_mtime column
  const hasMtime = (db.prepare(`SELECT COUNT(*) as c FROM pragma_table_info('jd_jobs') WHERE name='file_mtime'`).get() as { c: number }).c > 0
  if (!hasMtime) db.exec(`ALTER TABLE jd_jobs ADD COLUMN file_mtime TEXT`)

  // Migrate existing DBs that predate action column
  const hasAction = (db.prepare(`SELECT COUNT(*) as c FROM pragma_table_info('jd_jobs') WHERE name='action'`).get() as { c: number }).c > 0
  if (!hasAction) db.exec(`ALTER TABLE jd_jobs ADD COLUMN action TEXT`)

  // Migrate existing DBs that predate reasoning column
  const hasReasoning = (db.prepare(`SELECT COUNT(*) as c FROM pragma_table_info('jd_outputs') WHERE name='reasoning'`).get() as { c: number }).c > 0
  if (!hasReasoning) db.exec(`ALTER TABLE jd_outputs ADD COLUMN reasoning TEXT`)

  // Migrate existing DBs that predate pdf_path column
  const hasPdfPath = (db.prepare(`SELECT COUNT(*) as c FROM pragma_table_info('jd_outputs') WHERE name='pdf_path'`).get() as { c: number }).c > 0
  if (!hasPdfPath) db.exec(`ALTER TABLE jd_outputs ADD COLUMN pdf_path TEXT`)

  // Migrate existing DBs that predate cover_letter column
  const hasCoverLetter = (db.prepare(`SELECT COUNT(*) as c FROM pragma_table_info('jd_outputs') WHERE name='cover_letter'`).get() as { c: number }).c > 0
  if (!hasCoverLetter) db.exec(`ALTER TABLE jd_outputs ADD COLUMN cover_letter TEXT`)

  // Migrate existing DBs that predate user_settings table
  const hasUserSettings = (db.prepare(`SELECT COUNT(*) as c FROM sqlite_master WHERE type='table' AND name='user_settings'`).get() as { c: number }).c > 0
  if (!hasUserSettings) db.exec(`
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

  // Migrate existing DBs that predate ai_usage_log table
  const hasAiUsageLog = (db.prepare(`SELECT COUNT(*) as c FROM sqlite_master WHERE type='table' AND name='ai_usage_log'`).get() as { c: number }).c > 0
  if (!hasAiUsageLog) db.exec(`CREATE TABLE ai_usage_log (
    id INTEGER PRIMARY KEY,
    user_id TEXT NOT NULL,
    provider TEXT NOT NULL,
    model TEXT NOT NULL,
    feature TEXT NOT NULL,
    input_tok INTEGER NOT NULL DEFAULT 0,
    output_tok INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`)

  // Migrate existing DBs that predate users table
  const hasUsers = (db.prepare(`SELECT COUNT(*) as c FROM sqlite_master WHERE type='table' AND name='users'`).get() as { c: number }).c > 0
  if (!hasUsers) db.exec(`CREATE TABLE users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    is_demo INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`)

  // Migrate existing DBs that predate outreach_brief column on jd_jobs
  const hasOutreachBrief = (db.prepare(`SELECT COUNT(*) as c FROM pragma_table_info('jd_jobs') WHERE name='outreach_brief'`).get() as { c: number }).c > 0
  if (!hasOutreachBrief) db.exec(`ALTER TABLE jd_jobs ADD COLUMN outreach_brief TEXT`)

  const hasClippedAt = (db.prepare(`SELECT COUNT(*) as c FROM pragma_table_info('jd_jobs') WHERE name='clipped_at'`).get() as { c: number }).c > 0
  if (!hasClippedAt) db.exec(`ALTER TABLE jd_jobs ADD COLUMN clipped_at TEXT`)

  const hasHidden = (db.prepare(`SELECT COUNT(*) as c FROM pragma_table_info('jd_jobs') WHERE name='hidden'`).get() as { c: number }).c > 0
  if (!hasHidden) db.exec(`ALTER TABLE jd_jobs ADD COLUMN hidden INTEGER NOT NULL DEFAULT 0`)

  const hasApplyUrl = (db.prepare(`SELECT COUNT(*) as c FROM pragma_table_info('jd_jobs') WHERE name='apply_url'`).get() as { c: number }).c > 0
  if (!hasApplyUrl) db.exec(`ALTER TABLE jd_jobs ADD COLUMN apply_url TEXT`)

  const hasApplicationCase = (db.prepare(`SELECT COUNT(*) as c FROM pragma_table_info('jd_jobs') WHERE name='application_case'`).get() as { c: number }).c > 0
  if (!hasApplicationCase) db.exec('ALTER TABLE jd_jobs ADD COLUMN application_case TEXT')

  // Migrate existing DBs that predate outreach_items table
  const hasOutreachItems = (db.prepare(`SELECT COUNT(*) as c FROM sqlite_master WHERE type='table' AND name='outreach_items'`).get() as { c: number }).c > 0
  if (!hasOutreachItems) db.exec(`CREATE TABLE outreach_items (
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
  )`)

  // Migrate existing DBs that predate resume_profiles table
  const hasResumeProfiles = (db.prepare(`SELECT COUNT(*) as c FROM sqlite_master WHERE type='table' AND name='resume_profiles'`).get() as { c: number }).c > 0
  if (!hasResumeProfiles) db.exec(`CREATE TABLE resume_profiles (
    id         TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL,
    name       TEXT NOT NULL,
    data       TEXT NOT NULL,
    is_active  INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`)

  // Migrate existing DBs to add user_id column to data tables
  for (const table of ['jd_jobs', 'jd_outputs', 'jd_metrics', 'chat_messages', 'resume_sessions']) {
    ensureUserIdColumn(db, table)
  }

  // FTS5 for full-text search on company / role / raw content
  // Only create if the source columns exist (guards against legacy-schema migration tests)
  const hasFts = (db.prepare(`SELECT COUNT(*) as c FROM sqlite_master WHERE type='table' AND name='jd_jobs_fts'`).get() as { c: number }).c > 0
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
  if (hasColumn(db, 'jd_jobs', 'hidden') && hasColumn(db, 'jd_jobs', 'clipped_at')) {
    db.exec(`CREATE INDEX IF NOT EXISTS idx_jobs_user_hidden_clipped
      ON jd_jobs(user_id, hidden, clipped_at DESC)`)
  }
  if (hasColumn(db, 'jd_jobs', 'fit_pct')) {
    db.exec(`CREATE INDEX IF NOT EXISTS idx_jobs_user_fitpct ON jd_jobs(user_id, fit_pct)`)
  }
  if (hasColumn(db, 'jd_outputs', 'job_id')) {
    db.exec(`CREATE INDEX IF NOT EXISTS idx_outputs_job ON jd_outputs(job_id)`)
  }

  // Migrate existing users table to add auth columns
  if (!hasColumn(db, 'users', 'email_verified'))
    db.exec(`ALTER TABLE users ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 0`)
  if (!hasColumn(db, 'users', 'password_changed_at'))
    db.exec(`ALTER TABLE users ADD COLUMN password_changed_at DATETIME`)

  // Migrate: allow empty password for OAuth-only accounts
  // (password column already exists; DEFAULT '' is set on new tables above)

  // Auth tables for existing DBs
  const hasOAuthAccounts = (db.prepare(`SELECT COUNT(*) as c FROM sqlite_master WHERE type='table' AND name='oauth_accounts'`).get() as { c: number }).c > 0
  if (!hasOAuthAccounts) db.exec(`
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

  const hasPwResetTokens = (db.prepare(`SELECT COUNT(*) as c FROM sqlite_master WHERE type='table' AND name='password_reset_tokens'`).get() as { c: number }).c > 0
  if (!hasPwResetTokens) db.exec(`
    CREATE TABLE password_reset_tokens (
      id         TEXT PRIMARY KEY,
      user_id    TEXT NOT NULL REFERENCES users(id),
      token_hash TEXT NOT NULL UNIQUE,
      expires_at DATETIME NOT NULL,
      used       INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `)

  const hasEmailVerifTokens = (db.prepare(`SELECT COUNT(*) as c FROM sqlite_master WHERE type='table' AND name='email_verification_tokens'`).get() as { c: number }).c > 0
  if (!hasEmailVerifTokens) db.exec(`
    CREATE TABLE email_verification_tokens (
      id         TEXT PRIMARY KEY,
      user_id    TEXT NOT NULL REFERENCES users(id),
      token_hash TEXT NOT NULL UNIQUE,
      expires_at DATETIME NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `)

  // Seed demo user (pre-hashed bcrypt of 'demo', rounds=10) — local/self-hosted mode only
  if (!isCloud()) {
    const demoExists = (db.prepare(`SELECT COUNT(*) as c FROM users WHERE email = 'demo@demo.com'`).get() as { c: number }).c > 0
    if (!demoExists) db.prepare(`INSERT INTO users (id, email, password, is_demo) VALUES (?, ?, ?, 1)`)
      .run('demo-user', 'demo@demo.com', '$2b$10$p/KLnbVfAXylbVN9Eonw/emuhlarCDbTI4P5CZchZET/5zEAd1hmW')
  }

  // Migrate: add system_prompts table for existing DBs created before this column was added
  const hasSystemPrompts = (db.prepare(`SELECT COUNT(*) as c FROM sqlite_master WHERE type='table' AND name='system_prompts'`).get() as { c: number }).c > 0
  if (!hasSystemPrompts) db.exec(`
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

  // Seed system_prompts from disk files if table is empty (local dev only)
  // In production, content is seeded via NeonAdapter.initialize() or a one-time migration.
  seedSystemPromptsFromDisk(db)

  // Migrate resume_profiles: add kind, source, persona_md, updated_at columns
  if (!hasColumn(db, 'resume_profiles', 'kind'))
    db.exec(`ALTER TABLE resume_profiles ADD COLUMN kind TEXT NOT NULL DEFAULT 'custom'`)
  if (!hasColumn(db, 'resume_profiles', 'source'))
    db.exec(`ALTER TABLE resume_profiles ADD COLUMN source TEXT NOT NULL DEFAULT 'upload'`)
  if (!hasColumn(db, 'resume_profiles', 'persona_md'))
    db.exec(`ALTER TABLE resume_profiles ADD COLUMN persona_md TEXT`)
  if (!hasColumn(db, 'resume_profiles', 'updated_at'))
    db.exec(`ALTER TABLE resume_profiles ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP`)
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
    `INSERT OR IGNORE INTO system_prompts (id, prompt_key, version, content, is_active) VALUES (?, ?, ?, ?, ?)`
  )

  if (reasonContent)   insert.run('sp-reason-v1',       'reason',       1, reasonContent,      1)
  if (chatContent)     insert.run('sp-chat-v1',          'chat',         1, chatContent,        1)
  insert.run('sp-cover-letter-v1', 'cover-letter', 1, coverLetterContent, 1)
}

import type { Database as SqliteDB } from 'better-sqlite3'
import { isCloud } from './app-mode'
import { getDb } from './db'

// ── Interface ─────────────────────────────────────────────────────────────────
export interface DbAdapter {
  query<T>(sql: string, params?: unknown[]): Promise<T[]>
  queryOne<T>(sql: string, params?: unknown[]): Promise<T | undefined>
  run(sql: string, params?: unknown[]): Promise<void>
  exec(sql: string): Promise<void>
  initialize(): Promise<void>
  /** Run a sequence of statements atomically. SQLite uses a real transaction;
   *  Neon HTTP runs them sequentially (best-effort — no true atomicity). */
  runInTransaction(ops: Array<{ sql: string; params?: unknown[] }>): Promise<void>
}

// ── SQLite adapter (local mode) ───────────────────────────────────────────────
export class SqliteAdapter implements DbAdapter {
  constructor(private db: SqliteDB) {}

  async query<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    return this.db.prepare(sql).all(...params) as T[]
  }
  async queryOne<T>(sql: string, params: unknown[] = []): Promise<T | undefined> {
    return this.db.prepare(sql).get(...params) as T | undefined
  }
  async run(sql: string, params: unknown[] = []): Promise<void> {
    this.db.prepare(sql).run(...params)
  }
  async exec(sql: string): Promise<void> {
    this.db.exec(sql)
  }
  async runInTransaction(ops: Array<{ sql: string; params?: unknown[] }>): Promise<void> {
    const txn = this.db.transaction(() => {
      for (const { sql, params = [] } of ops) {
        this.db.prepare(sql).run(...params)
      }
    })
    txn()
  }
  async initialize(): Promise<void> {
    // Schema init runs inside getDb() — no extra work needed
  }
}

// ── Postgres schema (cloud mode) ──────────────────────────────────────────────
// SQLite → Postgres translation:
//   DATETIME → TIMESTAMPTZ
//   INTEGER PRIMARY KEY auto-increment → BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY
//   Other TEXT / INTEGER types unchanged (compatible)
export const NEON_SCHEMA = `
  CREATE TABLE IF NOT EXISTS jd_jobs (
    id               TEXT PRIMARY KEY,
    file_path        TEXT NOT NULL,
    company          TEXT,
    role_title       TEXT,
    tags             TEXT,
    visa_status      TEXT,
    role_track       TEXT,
    fit_pct          INTEGER,
    raw_content      TEXT,
    file_mtime       TEXT,
    clipped_at       TEXT,
    action           TEXT,
    outreach_brief   TEXT,
    hidden           INTEGER NOT NULL DEFAULT 0,
    apply_url        TEXT,
    application_case TEXT,
    user_id          TEXT NOT NULL,
    scanned_at       TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
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
    user_id       TEXT NOT NULL,
    built_at      TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS jd_metrics (
    computed_at      TIMESTAMPTZ,
    total_jobs       INTEGER,
    visa_kill_count  INTEGER,
    role_track_dist  TEXT,
    fit_dist         TEXT,
    user_id          TEXT NOT NULL
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
    user_id    TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_chat_session ON chat_messages(session_id, created_at);

  CREATE TABLE IF NOT EXISTS resume_sessions (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    data       TEXT NOT NULL DEFAULT '{}',
    user_id    TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS user_settings (
    user_id       TEXT NOT NULL,
    provider      TEXT NOT NULL,
    encrypted_key TEXT NOT NULL DEFAULT '',
    model         TEXT NOT NULL,
    base_url      TEXT,
    updated_at    TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, provider)
  );

  CREATE TABLE IF NOT EXISTS ai_usage_log (
    id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id    TEXT NOT NULL,
    provider   TEXT NOT NULL,
    model      TEXT NOT NULL,
    feature    TEXT NOT NULL,
    input_tok  INTEGER NOT NULL DEFAULT 0,
    output_tok INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS users (
    id                  TEXT PRIMARY KEY,
    email               TEXT UNIQUE NOT NULL,
    password            TEXT NOT NULL DEFAULT '',
    email_verified      INTEGER NOT NULL DEFAULT 0,
    password_changed_at TIMESTAMPTZ,
    is_demo             INTEGER NOT NULL DEFAULT 0,
    deleted_at          TIMESTAMPTZ,
    ip_hash             TEXT,
    demo_encrypted_pwd  TEXT,
    created_at          TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS oauth_accounts (
    id                  TEXT PRIMARY KEY,
    user_id             TEXT NOT NULL REFERENCES users(id),
    provider            TEXT NOT NULL,
    provider_account_id TEXT NOT NULL,
    created_at          TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(provider, provider_account_id)
  );
  CREATE INDEX IF NOT EXISTS idx_oauth_provider ON oauth_accounts(provider, provider_account_id);
  CREATE INDEX IF NOT EXISTS idx_users_ip_hash  ON users(ip_hash) WHERE is_demo = 1;

  CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id         TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL REFERENCES users(id),
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    used       INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS email_verification_tokens (
    id         TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL REFERENCES users(id),
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
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
    created_at     TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at     TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
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
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS system_prompts (
    id         TEXT PRIMARY KEY,
    prompt_key TEXT NOT NULL,
    version    INTEGER NOT NULL DEFAULT 1,
    content    TEXT NOT NULL,
    is_active  INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (prompt_key, version)
  );

  CREATE TABLE IF NOT EXISTS ingestion_sources (
    id                TEXT PRIMARY KEY,
    user_id           TEXT NOT NULL,
    type              TEXT NOT NULL,
    input_raw         TEXT NOT NULL,
    status            TEXT NOT NULL DEFAULT 'pending',
    extracted_partial TEXT,
    error_msg         TEXT,
    created_at        BIGINT NOT NULL DEFAULT extract(epoch from now())::bigint
  );
  CREATE INDEX IF NOT EXISTS idx_ingest_sources_user
    ON ingestion_sources(user_id, created_at DESC);
`

const NEON_DEMO_SEED = `
  INSERT INTO users (id, email, password, is_demo, email_verified)
  VALUES ('demo-user', 'demo@demo.com', '$2b$10$p/KLnbVfAXylbVN9Eonw/emuhlarCDbTI4P5CZchZET/5zEAd1hmW', 1, 1)
  ON CONFLICT (email) DO NOTHING;
`

// Migration guards for adding user_id to data tables on existing Neon DBs.
const NEON_USER_ID_MIGRATIONS = `
  ALTER TABLE jd_jobs         ADD COLUMN IF NOT EXISTS user_id TEXT NOT NULL DEFAULT 'default';
  ALTER TABLE jd_outputs      ADD COLUMN IF NOT EXISTS user_id TEXT NOT NULL DEFAULT 'default';
  ALTER TABLE jd_metrics      ADD COLUMN IF NOT EXISTS user_id TEXT NOT NULL DEFAULT 'default';
  ALTER TABLE chat_messages   ADD COLUMN IF NOT EXISTS user_id TEXT NOT NULL DEFAULT 'default';
  ALTER TABLE resume_sessions ADD COLUMN IF NOT EXISTS user_id TEXT NOT NULL DEFAULT 'default';
`

// Drop the temporary 'default' fallback once all rows are user-owned.
const NEON_DROP_USER_ID_DEFAULTS = `
  ALTER TABLE jd_jobs         ALTER COLUMN user_id DROP DEFAULT;
  ALTER TABLE jd_outputs      ALTER COLUMN user_id DROP DEFAULT;
  ALTER TABLE jd_metrics      ALTER COLUMN user_id DROP DEFAULT;
  ALTER TABLE chat_messages   ALTER COLUMN user_id DROP DEFAULT;
  ALTER TABLE resume_sessions ALTER COLUMN user_id DROP DEFAULT;
`

// Soft-delete support on the users table.
const NEON_SOFT_DELETE_MIGRATION = `
  ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
`

// ── Neon adapter (cloud mode) ─────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type NeonFn = any  // neon() return type — kept as any to allow .query() and .transaction()

// Convert SQLite-style `?` placeholders to Postgres-style `$1`, `$2`, ...
// Skips `?` inside single-quoted string literals.
function translatePlaceholders(sql: string): string {
  let result = ''
  let i = 0
  let n = 1
  let inString = false
  while (i < sql.length) {
    const ch = sql[i]
    if (ch === "'") {
      // Toggle string state; handle SQL-style '' escape by passing both chars through
      result += ch
      if (inString && sql[i + 1] === "'") {
        result += sql[i + 1]
        i += 2
        continue
      }
      inString = !inString
      i++
      continue
    }
    if (ch === '?' && !inString) {
      result += '$' + n
      n++
      i++
      continue
    }
    result += ch
    i++
  }
  return result
}

export class NeonAdapter implements DbAdapter {
  private neonFn: NeonFn
  private initialized = false

  constructor(connectionString: string) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { neon } = require('@neondatabase/serverless') as typeof import('@neondatabase/serverless')
    this.neonFn = neon(connectionString)
  }

  async query<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    const rows = await this.neonFn.query(translatePlaceholders(sql), params)
    return rows as T[]
  }
  async queryOne<T>(sql: string, params: unknown[] = []): Promise<T | undefined> {
    const rows = await this.neonFn.query(translatePlaceholders(sql), params)
    return (rows[0] as T) ?? undefined
  }
  async run(sql: string, params: unknown[] = []): Promise<void> {
    await this.neonFn.query(translatePlaceholders(sql), params)
  }
  async exec(sql: string): Promise<void> {
    // .query() is a prepared statement — rejects multiple commands.
    // Split on ';' and run each statement individually.
    const stmts = sql.split(';').map(s => s.trim()).filter(Boolean)
    for (const stmt of stmts) {
      await this.neonFn.query(stmt)
    }
  }
  async runInTransaction(ops: Array<{ sql: string; params?: unknown[] }>): Promise<void> {
    // neon() HTTP driver supports atomic batch transactions via .transaction().
    // All statements are sent in a single HTTP request, committed or rolled back together.
    await this.neonFn.transaction(
      ops.map(({ sql, params = [] }) => this.neonFn.query(translatePlaceholders(sql), params))
    )
  }
  private async _seedSystemPrompts(): Promise<void> {
    const { count } = (await this.queryOne<{ count: number }>(
      `SELECT COUNT(*) AS count FROM system_prompts`,
    )) ?? { count: 0 }
    if (count > 0) return // already seeded

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const fs   = require('fs')   as typeof import('fs')
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const path = require('path') as typeof import('path')
    const root = process.cwd()
    const tryRead = (rel: string) => {
      try { return fs.readFileSync(path.join(root, rel), 'utf8') } catch { return '' }
    }

    const atsGuide  = tryRead('docs/reference/ats-optimization-guidelines.md')
    const claudeFull = tryRead('docs/reference/CLAUDE-full.md')
    const atsSystem  = tryRead('docs/reference/ats-optimized-resume-system.md')
    const specMatch  = tryRead('docs/reference/spec-job-match-resume-generator.md')

    const seeds: Array<{ key: string; content: string }> = [
      { key: 'reason',       content: [atsGuide, claudeFull].filter(Boolean).join('\n\n') },
      { key: 'chat',         content: [atsSystem, specMatch].filter(Boolean).join('\n\n') },
      { key: 'cover-letter', content: atsGuide },
    ]

    for (const { key, content } of seeds) {
      if (!content) continue
      const id = `${key}-v1`
      await this.run(
        `INSERT INTO system_prompts (id, prompt_key, version, content, is_active)
         VALUES (?, ?, 1, ?, 1)
         ON CONFLICT (prompt_key, version) DO NOTHING`,
        [id, key, content],
      )
    }
  }

  async initialize(): Promise<void> {
    if (this.initialized) return
    const runSchema = this.exec.bind(this)
    await runSchema(NEON_SCHEMA)
    await runSchema(NEON_USER_ID_MIGRATIONS)
    await runSchema(`
      ALTER TABLE jd_jobs ADD COLUMN IF NOT EXISTS outreach_brief   TEXT;
      ALTER TABLE jd_jobs ADD COLUMN IF NOT EXISTS clipped_at       TEXT;
      ALTER TABLE jd_jobs ADD COLUMN IF NOT EXISTS hidden           INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE jd_jobs ADD COLUMN IF NOT EXISTS apply_url        TEXT;
      ALTER TABLE jd_jobs ADD COLUMN IF NOT EXISTS application_case TEXT;
    `)
    await runSchema(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified      INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMPTZ;
      ALTER TABLE users ALTER COLUMN password SET DEFAULT '';
    `)
    await runSchema(NEON_DROP_USER_ID_DEFAULTS)
    await runSchema(NEON_SOFT_DELETE_MIGRATION)
    // Migrate resume_profiles: new columns for persona and kind tracking
    await runSchema(`
      ALTER TABLE resume_profiles ADD COLUMN IF NOT EXISTS kind       TEXT NOT NULL DEFAULT 'custom';
      ALTER TABLE resume_profiles ADD COLUMN IF NOT EXISTS source     TEXT NOT NULL DEFAULT 'upload';
      ALTER TABLE resume_profiles ADD COLUMN IF NOT EXISTS persona_md TEXT;
      ALTER TABLE resume_profiles ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;
    `)
    // system_prompts table for existing Neon DBs
    await runSchema(`
      CREATE TABLE IF NOT EXISTS system_prompts (
        id         TEXT PRIMARY KEY,
        prompt_key TEXT NOT NULL,
        version    INTEGER NOT NULL DEFAULT 1,
        content    TEXT NOT NULL,
        is_active  INTEGER NOT NULL DEFAULT 1,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (prompt_key, version)
      );
    `)
    // Seed system_prompts from disk if the table is empty.
    // Files exist in the Docker image on the first deploy after privatization;
    // subsequent deploys skip this because rows already exist.
    await this._seedSystemPrompts()
    // Demo user per-IP columns (added with ip-based demo session feature)
    await runSchema(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS ip_hash            TEXT;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS demo_encrypted_pwd TEXT;
      CREATE INDEX IF NOT EXISTS idx_users_ip_hash ON users(ip_hash) WHERE is_demo = 1;
    `)
    if (!isCloud()) await runSchema(NEON_DEMO_SEED)
    this.initialized = true
  }
}

// ── Singleton factory ─────────────────────────────────────────────────────────
let _adapterPromise: Promise<DbAdapter> | null = null

export function getAdapter(): Promise<DbAdapter> {
  if (!_adapterPromise) {
    _adapterPromise = (async () => {
      if (isCloud()) {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { neonConfig } = require('@neondatabase/serverless') as typeof import('@neondatabase/serverless')
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const ws = require('ws') as typeof import('ws')
        neonConfig.webSocketConstructor = ws as unknown as typeof WebSocket
        const url = process.env.DATABASE_URL
        if (!url) throw new Error('DATABASE_URL env var required in cloud mode')
        const adapter = new NeonAdapter(url)
        await adapter.initialize()
        return adapter
      } else {
        const adapter = new SqliteAdapter(getDb())
        await adapter.initialize()
        return adapter
      }
    })().catch(err => {
      // Reset so next call retries rather than replaying the same rejected promise
      _adapterPromise = null
      throw err
    })
  }
  return _adapterPromise
}

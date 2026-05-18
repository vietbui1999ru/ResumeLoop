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
    action         TEXT,
    outreach_brief TEXT,
    hidden         INTEGER NOT NULL DEFAULT 0,
    apply_url      TEXT,
    user_id        TEXT NOT NULL,
    scanned_at     TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
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
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  );
`

const NEON_DEMO_SEED = `
  INSERT INTO users (id, email, password, is_demo)
  VALUES ('demo-user', 'demo@demo.com', '$2b$10$p/KLnbVfAXylbVN9Eonw/emuhlarCDbTI4P5CZchZET/5zEAd1hmW', 1)
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
interface NeonQueryFn {
  query(sql: string, params?: unknown[]): Promise<unknown[]>
}

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
  private neonSql: NeonQueryFn
  private initialized = false

  constructor(connectionString: string) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { neon } = require('@neondatabase/serverless') as typeof import('@neondatabase/serverless')
    // Use .query() — neon() no longer supports plain function-call form
    this.neonSql = neon(connectionString) as unknown as NeonQueryFn
  }

  async query<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    const rows = await this.neonSql.query(translatePlaceholders(sql), params)
    return rows as T[]
  }
  async queryOne<T>(sql: string, params: unknown[] = []): Promise<T | undefined> {
    const rows = await this.neonSql.query(translatePlaceholders(sql), params)
    return (rows[0] as T) ?? undefined
  }
  async run(sql: string, params: unknown[] = []): Promise<void> {
    await this.neonSql.query(translatePlaceholders(sql), params)
  }
  async exec(sql: string): Promise<void> {
    // .query() is a prepared statement — rejects multiple commands.
    // Split on ';' and run each statement individually.
    const stmts = sql.split(';').map(s => s.trim()).filter(Boolean)
    for (const stmt of stmts) {
      await this.neonSql.query(stmt)
    }
  }
  async initialize(): Promise<void> {
    if (this.initialized) return
    const runSchema = this.exec.bind(this)
    await runSchema(NEON_SCHEMA)
    await runSchema(NEON_USER_ID_MIGRATIONS)
    await runSchema(`
      ALTER TABLE jd_jobs ADD COLUMN IF NOT EXISTS outreach_brief TEXT;
      ALTER TABLE jd_jobs ADD COLUMN IF NOT EXISTS clipped_at TEXT;
      ALTER TABLE jd_jobs ADD COLUMN IF NOT EXISTS hidden INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE jd_jobs ADD COLUMN IF NOT EXISTS apply_url TEXT;
      ALTER TABLE jd_jobs ADD COLUMN IF NOT EXISTS application_case TEXT;
      CREATE TABLE IF NOT EXISTS resume_profiles (
        id         TEXT PRIMARY KEY,
        user_id    TEXT NOT NULL,
        name       TEXT NOT NULL,
        data       TEXT NOT NULL,
        is_active  INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );
    `)
    await runSchema(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified      INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMPTZ;
      ALTER TABLE users ALTER COLUMN password SET DEFAULT '';
    `)
    await runSchema(NEON_DROP_USER_ID_DEFAULTS)
    await runSchema(NEON_SOFT_DELETE_MIGRATION)
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

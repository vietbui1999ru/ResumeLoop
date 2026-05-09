import Database, { type Database as DB } from 'better-sqlite3'
import path from 'path'

let _db: DB | null = null

export function getDb(): DB {
  if (_db) return _db
  const dbPath = process.env.DB_PATH
    ? path.resolve(process.cwd(), process.env.DB_PATH)
    : path.join(process.cwd(), 'resume.db')
  _db = new Database(dbPath)
  _db.pragma('journal_mode = WAL')
  _db.pragma('foreign_keys = ON')
  initSchema(_db)
  return _db
}

export function initSchema(db: DB): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS jd_jobs (
      id          TEXT PRIMARY KEY,
      file_path   TEXT NOT NULL,
      company     TEXT,
      role_title  TEXT,
      tags        TEXT,
      visa_status TEXT,
      role_track  TEXT,
      fit_pct     INTEGER,
      raw_content TEXT,
      file_mtime  TEXT,
      scanned_at  DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS jd_outputs (
      id            TEXT PRIMARY KEY,
      job_id        TEXT NOT NULL REFERENCES jd_jobs(id),
      docx_path     TEXT,
      projects_used TEXT,
      work_ids_used TEXT,
      variant       TEXT,
      tagline       TEXT,
      built_at      DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS jd_metrics (
      computed_at      DATETIME,
      total_jobs       INTEGER,
      visa_kill_count  INTEGER,
      role_track_dist  TEXT,
      fit_dist         TEXT
    );

    CREATE TABLE IF NOT EXISTS app_settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `)

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
}

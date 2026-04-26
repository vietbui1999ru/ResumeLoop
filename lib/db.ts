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

function initSchema(db: DB): void {
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
  `)
}

import fs from 'fs'
import path from 'path'
import { randomUUID } from 'crypto'
import { getDb } from './db'
import { PATHS } from './paths'

export interface Session {
  id: string
  name: string
  created_at: string
  updated_at: string
}

export interface SessionWithData extends Session {
  data: string
}

let initialized = false

export function ensureDefaultSession(): void {
  if (initialized) return
  initialized = true

  const db = getDb()
  const existing = db.prepare('SELECT id FROM resume_sessions WHERE id = ?').get('default')
  if (existing) return

  let data = '{}'
  try {
    data = fs.readFileSync(PATHS.pipeline.masterData, 'utf8')
  } catch { /* file may not exist yet */ }

  db.prepare('INSERT INTO resume_sessions (id, name, data) VALUES (?, ?, ?)').run('default', 'Default', data)
}

export function listSessions(): Session[] {
  ensureDefaultSession()
  return getDb()
    .prepare('SELECT id, name, created_at, updated_at FROM resume_sessions ORDER BY created_at ASC')
    .all() as Session[]
}

export function getSession(id: string): SessionWithData | undefined {
  ensureDefaultSession()
  return getDb()
    .prepare('SELECT id, name, data, created_at, updated_at FROM resume_sessions WHERE id = ?')
    .get(id) as SessionWithData | undefined
}

export function createSession(name: string): Session {
  ensureDefaultSession()
  const db = getDb()
  const defaultSession = db
    .prepare('SELECT data FROM resume_sessions WHERE id = ?')
    .get('default') as { data: string } | undefined
  const data = defaultSession?.data ?? '{}'
  const id = randomUUID()
  db.prepare('INSERT INTO resume_sessions (id, name, data) VALUES (?, ?, ?)').run(id, name, data)
  return db
    .prepare('SELECT id, name, created_at, updated_at FROM resume_sessions WHERE id = ?')
    .get(id) as Session
}

export function renameSession(id: string, name: string): void {
  ensureDefaultSession()
  if (id === 'default') throw new Error('Cannot rename default session')
  getDb().prepare('UPDATE resume_sessions SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(name, id)
}

export function deleteSession(id: string): void {
  ensureDefaultSession()
  if (id === 'default') throw new Error('Cannot delete default session')
  getDb().prepare('DELETE FROM resume_sessions WHERE id = ?').run(id)
}

export function updateSessionData(id: string, data: string): void {
  ensureDefaultSession()
  getDb()
    .prepare('UPDATE resume_sessions SET data = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
    .run(data, id)
  if (id === 'default') syncMasterFile(data)
}

export function promoteSession(id: string): void {
  ensureDefaultSession()
  if (id === 'default') throw new Error('Cannot promote default session')
  const session = getSession(id)
  if (!session) throw new Error(`Session not found: ${id}`)
  updateSessionData('default', session.data)
}

function syncMasterFile(data: string): void {
  try {
    const tmp = PATHS.pipeline.masterData + '.tmp'
    fs.writeFileSync(tmp, data, 'utf8')
    fs.renameSync(tmp, PATHS.pipeline.masterData)
  } catch { /* non-fatal */ }
}

import fs from 'fs'
import { randomUUID } from 'crypto'
import { getAdapter } from './db-adapter'
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

const seededDefaults = new Set<string>()

// Each user gets their own "default" session, identified by id = `default:<userId>`.
// Legacy single-tenant rows used id = 'default' with user_id = 'default'.
function defaultSessionId(userId: string): string {
  return userId === 'default' ? 'default' : `default:${userId}`
}

export async function ensureDefaultSession(userId: string = 'default'): Promise<void> {
  if (seededDefaults.has(userId)) return
  seededDefaults.add(userId)

  const db = await getAdapter()
  const defId = defaultSessionId(userId)
  const existing = await db.queryOne<{ id: string }>(
    'SELECT id FROM resume_sessions WHERE id = ? AND user_id = ?',
    [defId, userId],
  )
  if (existing) return

  // Seed from active profile in DB; fall back to disk file for backwards compat
  let data = '{}'
  const activeProfile = await db.queryOne<{ data: string }>(
    'SELECT data FROM resume_profiles WHERE user_id = ? AND is_active = 1 LIMIT 1',
    [userId],
  )
  if (activeProfile) {
    data = activeProfile.data
  } else {
    try { data = fs.readFileSync(PATHS.pipeline.masterData, 'utf8') } catch { /* file may not exist */ }
  }

  await db.run(
    'INSERT INTO resume_sessions (id, name, data, user_id) VALUES (?, ?, ?, ?)',
    [defId, 'Default', data, userId],
  )
}

export async function listSessions(userId: string = 'default'): Promise<Session[]> {
  await ensureDefaultSession(userId)
  const db = await getAdapter()
  return db.query<Session>(
    'SELECT id, name, created_at, updated_at FROM resume_sessions WHERE user_id = ? ORDER BY created_at ASC',
    [userId],
  )
}

export async function getSession(id: string, userId: string = 'default'): Promise<SessionWithData | undefined> {
  await ensureDefaultSession(userId)
  const db = await getAdapter()
  // Treat the public id 'default' as the user's default session.
  const realId = id === 'default' ? defaultSessionId(userId) : id
  return db.queryOne<SessionWithData>(
    'SELECT id, name, data, created_at, updated_at FROM resume_sessions WHERE id = ? AND user_id = ?',
    [realId, userId],
  )
}

export async function createSession(name: string, userId: string = 'default'): Promise<Session> {
  await ensureDefaultSession(userId)
  const db = await getAdapter()
  const defId = defaultSessionId(userId)
  const defaultSession = await db.queryOne<{ data: string }>(
    'SELECT data FROM resume_sessions WHERE id = ? AND user_id = ?',
    [defId, userId],
  )
  const data = defaultSession?.data ?? '{}'
  const id = randomUUID()
  await db.run(
    'INSERT INTO resume_sessions (id, name, data, user_id) VALUES (?, ?, ?, ?)',
    [id, name, data, userId],
  )
  const created = await db.queryOne<Session>(
    'SELECT id, name, created_at, updated_at FROM resume_sessions WHERE id = ? AND user_id = ?',
    [id, userId],
  )
  if (!created) throw new Error(`Failed to create session: ${id}`)
  return created
}

export async function renameSession(id: string, name: string, userId: string = 'default'): Promise<void> {
  await ensureDefaultSession(userId)
  if (id === 'default') throw new Error('Cannot rename default session')
  const db = await getAdapter()
  await db.run(
    'UPDATE resume_sessions SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?',
    [name, id, userId],
  )
}

export async function deleteSession(id: string, userId: string = 'default'): Promise<void> {
  await ensureDefaultSession(userId)
  if (id === 'default') throw new Error('Cannot delete default session')
  const db = await getAdapter()
  await db.run('DELETE FROM resume_sessions WHERE id = ? AND user_id = ?', [id, userId])
}

export async function updateSessionData(id: string, data: string, userId: string = 'default'): Promise<void> {
  await ensureDefaultSession(userId)
  const db = await getAdapter()
  const realId = id === 'default' ? defaultSessionId(userId) : id
  await db.run(
    'UPDATE resume_sessions SET data = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?',
    [data, realId, userId],
  )
  if (id === 'default' && userId === 'default') syncMasterFile(data)
}

export async function promoteSession(id: string, userId: string = 'default'): Promise<void> {
  await ensureDefaultSession(userId)
  if (id === 'default') throw new Error('Cannot promote default session')
  const session = await getSession(id, userId)
  if (!session) throw new Error(`Session not found: ${id}`)
  await updateSessionData('default', session.data, userId)
}

function syncMasterFile(data: string): void {
  try {
    const tmp = PATHS.pipeline.masterData + '.tmp'
    fs.writeFileSync(tmp, data, 'utf8')
    fs.renameSync(tmp, PATHS.pipeline.masterData)
  } catch { /* non-fatal */ }
}

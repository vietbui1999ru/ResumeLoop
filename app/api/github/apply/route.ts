import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { getSession, updateSessionData } from '@/lib/sessions'
import { getAdapter } from '@/lib/db-adapter'

interface ProjectInput {
  id: string
  name: string
  short_stack: string
  bullets: string[]
}

type MasterData = { projects?: Array<{ id: string; [k: string]: unknown }>; [k: string]: unknown }

function upsertProject(master: MasterData, entry: { id: string; name: string; short_stack: string; bullets: string[] }): boolean {
  if (!Array.isArray(master.projects)) master.projects = []
  const idx = master.projects.findIndex(p => p.id === entry.id)
  if (idx >= 0) { master.projects[idx] = entry; return true }
  master.projects.push(entry)
  return false
}

export async function POST(req: Request) {
  const authSession = await auth()
  if (!authSession?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = authSession.user.id

  const { project, sessionId = 'default' } = await req.json() as { project?: ProjectInput; sessionId?: string }
  if (!project?.id || !project.bullets?.length) {
    return NextResponse.json({ error: 'project with id and bullets required' }, { status: 400 })
  }
  if (!/^[a-z0-9_-]{1,40}$/.test(project.id)) {
    return NextResponse.json({ error: 'project.id must be lowercase alphanumeric, dashes/underscores, max 40 chars' }, { status: 400 })
  }
  if (!Array.isArray(project.bullets) || project.bullets.some(b => typeof b !== 'string' || b.length > 116)) {
    return NextResponse.json({ error: 'bullets must be strings each ≤116 chars' }, { status: 400 })
  }

  const defaultSession = await getSession('default', userId)
  let master: MasterData
  try {
    master = JSON.parse(defaultSession?.data ?? '{}')
  } catch {
    return NextResponse.json({ error: 'Could not parse session data' }, { status: 500 })
  }

  const newEntry = { id: project.id, name: project.name, short_stack: project.short_stack, bullets: project.bullets }
  const replaced = upsertProject(master, newEntry)

  // Canonical write: updates user's default session + syncs disk via syncMasterFile
  await updateSessionData('default', JSON.stringify(master, null, 2), userId)

  // If the active session diverges from default, patch just this project into it too
  if (sessionId !== 'default') {
    const activeSession = await getSession(sessionId, userId)
    if (activeSession) {
      let activeMaster: MasterData
      try { activeMaster = JSON.parse(activeSession.data) } catch { activeMaster = {} }
      upsertProject(activeMaster, newEntry)
      await updateSessionData(sessionId, JSON.stringify(activeMaster, null, 2), userId)
    }
  }

  // Also write to the active resume_profile so the config editor reflects the import
  const db = await getAdapter()
  const activeProfile = await db.queryOne<{ id: string; data: string }>(
    'SELECT id, data FROM resume_profiles WHERE user_id = ? AND is_active = 1 LIMIT 1',
    [userId],
  )
  if (activeProfile) {
    let profileData: MasterData
    try { profileData = JSON.parse(activeProfile.data) } catch { profileData = {} }
    upsertProject(profileData, newEntry)
    await db.run(
      'UPDATE resume_profiles SET data = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [JSON.stringify(profileData, null, 2), activeProfile.id],
    )
  }

  return NextResponse.json({ ok: true, replaced })
}

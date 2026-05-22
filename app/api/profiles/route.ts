import { NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { auth } from '@/lib/auth'
import { getAdapter } from '@/lib/db-adapter'

export interface Profile {
  id: string
  user_id: string
  name: string
  data: string
  is_active: number
  created_at: string
}

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = session.user.id

  const db = await getAdapter()
  const profiles = await db.query<Profile>(
    'SELECT id, name, is_active, created_at FROM resume_profiles WHERE user_id = ? ORDER BY created_at ASC',
    [userId],
  )
  return NextResponse.json({ profiles })
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = session.user.id

  const body = await req.json() as { name?: string; data?: string; fork_from?: string }
  const { name, data: bodyData, fork_from } = body

  if (!name?.trim()) return NextResponse.json({ error: 'Name required' }, { status: 400 })

  const db = await getAdapter()

  let data: string
  if (fork_from) {
    // Fork from existing profile
    const source = await db.queryOne<Profile>(
      'SELECT data FROM resume_profiles WHERE id = ? AND user_id = ?',
      [fork_from, userId],
    )
    if (!source) return NextResponse.json({ error: 'Source profile not found' }, { status: 404 })
    data = source.data
  } else if (bodyData) {
    // Upload / paste
    try { JSON.parse(bodyData) } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
    data = bodyData
  } else {
    // New profile — start empty; user fills via onboarding ingest flow
    data = JSON.stringify({ experience: [], projects: [], skills: {} })
  }

  const id = randomUUID()
  // If this is the first profile, make it active
  const count = (await db.query<{ c: number }>('SELECT COUNT(*) as c FROM resume_profiles WHERE user_id = ?', [userId]))[0]?.c ?? 0
  const is_active = count === 0 ? 1 : 0

  await db.run(
    'INSERT INTO resume_profiles (id, user_id, name, data, is_active) VALUES (?, ?, ?, ?, ?)',
    [id, userId, name.trim(), data, is_active],
  )

  return NextResponse.json({ id, name: name.trim(), is_active, data })
}

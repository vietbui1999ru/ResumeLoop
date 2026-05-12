import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { getAdapter } from '@/lib/db-adapter'

type Ctx = { params: Promise<{ id: string }> }

export async function GET(_req: Request, { params }: Ctx) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = session.user.id
  const { id } = await params

  const db = await getAdapter()
  const profile = await db.queryOne<{ id: string; name: string; data: string; is_active: number }>(
    'SELECT id, name, data, is_active FROM resume_profiles WHERE id = ? AND user_id = ?',
    [id, userId],
  )
  if (!profile) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(profile)
}

export async function PATCH(req: Request, { params }: Ctx) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = session.user.id
  const { id } = await params

  const body = await req.json() as { name?: string; data?: string; set_active?: boolean }
  const db = await getAdapter()

  const existing = await db.queryOne<{ id: string }>(
    'SELECT id FROM resume_profiles WHERE id = ? AND user_id = ?',
    [id, userId],
  )
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (body.set_active) {
    // Clear all active flags for this user, then set this one
    await db.run('UPDATE resume_profiles SET is_active = 0 WHERE user_id = ?', [userId])
    await db.run('UPDATE resume_profiles SET is_active = 1 WHERE id = ? AND user_id = ?', [id, userId])
  }

  if (body.name !== undefined) {
    if (!body.name.trim()) return NextResponse.json({ error: 'Name required' }, { status: 400 })
    await db.run('UPDATE resume_profiles SET name = ? WHERE id = ? AND user_id = ?', [body.name.trim(), id, userId])
  }

  if (body.data !== undefined) {
    try { JSON.parse(body.data) } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
    await db.run('UPDATE resume_profiles SET data = ? WHERE id = ? AND user_id = ?', [body.data, id, userId])
  }

  return NextResponse.json({ ok: true })
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = session.user.id
  const { id } = await params

  const db = await getAdapter()

  const count = (await db.query<{ c: number }>('SELECT COUNT(*) as c FROM resume_profiles WHERE user_id = ?', [userId]))[0]?.c ?? 0
  if (count <= 1) return NextResponse.json({ error: 'Cannot delete the only profile' }, { status: 400 })

  const profile = await db.queryOne<{ is_active: number }>(
    'SELECT is_active FROM resume_profiles WHERE id = ? AND user_id = ?',
    [id, userId],
  )
  if (!profile) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await db.run('DELETE FROM resume_profiles WHERE id = ? AND user_id = ?', [id, userId])

  // If we deleted the active profile, activate the most recent remaining one
  if (profile.is_active) {
    const next = await db.queryOne<{ id: string }>(
      'SELECT id FROM resume_profiles WHERE user_id = ? ORDER BY created_at DESC LIMIT 1',
      [userId],
    )
    if (next) {
      await db.run('UPDATE resume_profiles SET is_active = 1 WHERE id = ? AND user_id = ?', [next.id, userId])
    }
  }

  return NextResponse.json({ ok: true })
}

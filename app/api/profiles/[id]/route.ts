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
  const profile = await db.queryOne<{ id: string; name: string; data: string; is_active: number; persona_md: string | null }>(
    'SELECT id, name, data, is_active, persona_md FROM resume_profiles WHERE id = ? AND user_id = ?',
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

  type ContactFields = { name?: string; phone?: string; location?: string; email?: string; linkedin?: string; portfolio?: string; work_auth?: string }
  const body = await req.json() as { name?: string; data?: string; set_active?: boolean; persona_md?: string; contact?: ContactFields }

  try {
    const db = await getAdapter()

    const existing = await db.queryOne<{ id: string; kind: string }>(
      'SELECT id, kind FROM resume_profiles WHERE id = ? AND user_id = ?',
      [id, userId],
    )
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    if (body.set_active) {
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

    if (body.contact !== undefined) {
      const current = await db.queryOne<{ data: string }>(
        'SELECT data FROM resume_profiles WHERE id = ? AND user_id = ?',
        [id, userId],
      )
      const parsed = (() => { try { return JSON.parse(current?.data ?? '{}') } catch { return {} } })()
      const trimmed: Record<string, string> = {}
      for (const [k, v] of Object.entries(body.contact)) {
        if (typeof v === 'string') trimmed[k] = v.trim()
      }
      parsed.contact = trimmed
      await db.run(
        'UPDATE resume_profiles SET data = ? WHERE id = ? AND user_id = ?',
        [JSON.stringify(parsed, null, 2), id, userId],
      )
    }

    if (body.persona_md !== undefined) {
      if (body.persona_md !== null && body.persona_md.length > 4000) {
        return NextResponse.json({ error: 'persona_md exceeds 4000 character limit' }, { status: 400 })
      }
      const { sanitizePersonaMd } = await import('@/lib/sanitize-persona')
      const sanitized = body.persona_md ? sanitizePersonaMd(body.persona_md) : null
      await db.run(
        'UPDATE resume_profiles SET persona_md = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?',
        [sanitized, id, userId],
      )
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    const code = (err as { code?: string }).code ?? ''
    if (code === 'SQLITE_BUSY' || code === 'SQLITE_LOCKED') {
      return NextResponse.json({ error: 'Database busy — try again in a moment' }, { status: 503 })
    }
    console.error('[PATCH /api/profiles/:id]', err)
    return NextResponse.json({ error: 'Service unavailable' }, { status: 503 })
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = session.user.id
  const { id } = await params

  const db = await getAdapter()

  const count = (await db.query<{ c: number }>('SELECT COUNT(*) as c FROM resume_profiles WHERE user_id = ?', [userId]))[0]?.c ?? 0
  if (count <= 1) return NextResponse.json({ error: 'Cannot delete the only profile' }, { status: 400 })

  const profile = await db.queryOne<{ is_active: number; kind: string }>(
    'SELECT is_active, kind FROM resume_profiles WHERE id = ? AND user_id = ?',
    [id, userId],
  )
  if (!profile) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (profile.kind === 'default') {
    return NextResponse.json({ error: 'Cannot delete the default profile' }, { status: 400 })
  }

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

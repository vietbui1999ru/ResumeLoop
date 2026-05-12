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
  const job = await db.queryOne(`
    SELECT id, company, role_title, role_track, fit_pct, visa_status, tags, action,
           file_mtime, scanned_at, file_path, raw_content, apply_url
    FROM jd_jobs WHERE id = ? AND user_id = ?
  `, [id, userId])
  if (!job) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(job)
}

export async function PATCH(req: Request, { params }: Ctx) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = session.user.id

  const { id } = await params
  const body = await req.json() as { hidden?: number; apply_url?: string | null }
  const db = await getAdapter()

  if ('hidden' in body) {
    if (body.hidden !== 0 && body.hidden !== 1) {
      return NextResponse.json({ error: 'hidden must be 0 or 1' }, { status: 400 })
    }
    await db.run('UPDATE jd_jobs SET hidden = ? WHERE id = ? AND user_id = ?', [body.hidden, id, userId])
  }

  if ('apply_url' in body) {
    const url = body.apply_url?.trim() || null
    await db.run('UPDATE jd_jobs SET apply_url = ? WHERE id = ? AND user_id = ?', [url, id, userId])
  }

  return NextResponse.json({ ok: true })
}

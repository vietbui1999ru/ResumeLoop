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
  const body = await req.json() as { hidden?: number; apply_url?: string | null; tags?: string[]; role_title?: string }
  const db = await getAdapter()

  if ('hidden' in body) {
    if (body.hidden !== 0 && body.hidden !== 1) {
      return NextResponse.json({ error: 'hidden must be 0 or 1' }, { status: 400 })
    }
    await db.run('UPDATE jd_jobs SET hidden = ? WHERE id = ? AND user_id = ?', [body.hidden, id, userId])
  }

  if ('apply_url' in body) {
    const url = body.apply_url?.trim() || null
    if (url && !/^https?:\/\//i.test(url)) {
      return NextResponse.json({ error: 'apply_url must start with http:// or https://' }, { status: 400 })
    }
    await db.run('UPDATE jd_jobs SET apply_url = ? WHERE id = ? AND user_id = ?', [url, id, userId])
  }

  if ('tags' in body && Array.isArray(body.tags)) {
    await db.run('UPDATE jd_jobs SET tags = ? WHERE id = ? AND user_id = ?',
      [JSON.stringify(body.tags), id, userId])
  }

  if ('role_title' in body) {
    const title = body.role_title?.trim()
    if (!title) return NextResponse.json({ error: 'role_title cannot be empty' }, { status: 400 })
    await db.run('UPDATE jd_jobs SET role_title = ? WHERE id = ? AND user_id = ?', [title, id, userId])
  }

  return NextResponse.json({ ok: true })
}

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { getAdapter } from '@/lib/db-adapter'
import { JobPatchInputSchema } from '@/lib/schemas/jobs'

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
  const bodyParse = JobPatchInputSchema.safeParse(await req.json())
  if (!bodyParse.success) {
    const message = bodyParse.error.errors[0]?.message ?? 'Invalid request body'
    return NextResponse.json({ error: message }, { status: 400 })
  }
  const body = bodyParse.data
  const db = await getAdapter()

  if ('hidden' in body && body.hidden !== undefined) {
    await db.run('UPDATE jd_jobs SET hidden = ? WHERE id = ? AND user_id = ?', [body.hidden, id, userId])
  }

  if ('apply_url' in body) {
    const url = body.apply_url?.trim() || null
    await db.run('UPDATE jd_jobs SET apply_url = ? WHERE id = ? AND user_id = ?', [url, id, userId])
  }

  if ('tags' in body && Array.isArray(body.tags)) {
    await db.run('UPDATE jd_jobs SET tags = ? WHERE id = ? AND user_id = ?',
      [JSON.stringify(body.tags), id, userId])
  }

  if ('role_title' in body && body.role_title !== undefined) {
    await db.run('UPDATE jd_jobs SET role_title = ? WHERE id = ? AND user_id = ?', [body.role_title, id, userId])
  }

  return NextResponse.json({ ok: true })
}

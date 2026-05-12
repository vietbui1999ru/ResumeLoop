import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { getAdapter } from '@/lib/db-adapter'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = session.user.id

  const { id } = await params
  const db = await getAdapter()
  const row = await db.queryOne(`
    SELECT id, job_id, docx_path, pdf_path, projects_used, work_ids_used,
           variant, tagline, reasoning, cover_letter, built_at
    FROM jd_outputs
    WHERE job_id = ? AND user_id = ?
    ORDER BY built_at DESC
    LIMIT 1
  `, [id, userId])

  if (!row) return NextResponse.json({ error: 'No output found' }, { status: 404 })
  return NextResponse.json(row)
}

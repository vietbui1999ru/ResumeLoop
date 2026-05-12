import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { getAdapter } from '@/lib/db-adapter'
import { listOutreachItems } from '@/lib/outreach'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = session.user.id
  const { id: jobId } = await params

  const db = await getAdapter()
  const job = await db.queryOne<{ outreach_brief: string | null }>(
    'SELECT outreach_brief FROM jd_jobs WHERE id = ? AND user_id = ?',
    [jobId, userId],
  )
  if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 })

  const items = await listOutreachItems(jobId, userId)
  return NextResponse.json({ items, brief: job.outreach_brief ?? null })
}

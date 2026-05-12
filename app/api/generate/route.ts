import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { getAdapter } from '@/lib/db-adapter'

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = session.user.id

  const { jobIds }: { jobIds: string[] } = await req.json()
  if (!Array.isArray(jobIds) || jobIds.length === 0) {
    return NextResponse.json({ error: 'jobIds must be non-empty array' }, { status: 400 })
  }

  const db = await getAdapter()
  const unknown: string[] = []
  for (const id of jobIds) {
    const row = await db.queryOne<{ one: number }>(
      'SELECT 1 as one FROM jd_jobs WHERE id = ? AND user_id = ?',
      [id, userId],
    )
    if (!row) unknown.push(id)
  }
  if (unknown.length > 0) {
    return NextResponse.json({ error: `Unknown job IDs: ${unknown.join(', ')}` }, { status: 400 })
  }

  return NextResponse.json({ ok: true, validated: jobIds, message: 'Jobs validated. Trigger generation via GET /api/generate/:jobId/stream for each job.' })
}

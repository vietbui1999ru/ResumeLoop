import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export async function POST(req: Request) {
  const { jobIds }: { jobIds: string[] } = await req.json()
  if (!Array.isArray(jobIds) || jobIds.length === 0) {
    return NextResponse.json({ error: 'jobIds must be non-empty array' }, { status: 400 })
  }

  const db = getDb()
  const unknown = jobIds.filter(id => !db.prepare('SELECT 1 FROM jd_jobs WHERE id = ?').get(id))
  if (unknown.length > 0) {
    return NextResponse.json({ error: `Unknown job IDs: ${unknown.join(', ')}` }, { status: 400 })
  }

  return NextResponse.json({ ok: true, queued: jobIds })
}

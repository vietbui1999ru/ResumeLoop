import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const job = getDb().prepare(`
    SELECT id, company, role_title, role_track, fit_pct, visa_status, tags, action,
           file_mtime, scanned_at, file_path, raw_content
    FROM jd_jobs WHERE id = ?
  `).get(id)
  if (!job) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(job)
}

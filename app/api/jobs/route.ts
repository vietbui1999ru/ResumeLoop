import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

const BASE_COLS = `
  j.id, j.company, j.role_title, j.role_track, j.fit_pct, j.visa_status,
  j.tags, j.action, j.file_mtime, j.scanned_at,
  EXISTS(SELECT 1 FROM jd_outputs WHERE job_id = j.id AND reasoning IS NOT NULL) as has_reasoning,
  EXISTS(SELECT 1 FROM jd_outputs WHERE job_id = j.id) as has_output
`

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get('q')?.trim() ?? ''

  const jobs = q
    ? getDb().prepare(`
        SELECT ${BASE_COLS} FROM jd_jobs j
        WHERE j.company LIKE ? OR j.role_title LIKE ? OR j.role_track LIKE ? OR j.raw_content LIKE ?
        ORDER BY j.company ASC
      `).all(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`)
    : getDb().prepare(`
        SELECT ${BASE_COLS} FROM jd_jobs j ORDER BY j.company ASC
      `).all()

  return NextResponse.json(jobs)
}

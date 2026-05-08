import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

const BASE_COLS = `id, company, role_title, role_track, fit_pct, visa_status, tags, action, file_mtime, scanned_at`

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get('q')?.trim() ?? ''

  const jobs = q
    ? getDb().prepare(`
        SELECT ${BASE_COLS} FROM jd_jobs
        WHERE company LIKE ? OR role_title LIKE ? OR role_track LIKE ? OR raw_content LIKE ?
        ORDER BY company ASC
      `).all(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`)
    : getDb().prepare(`
        SELECT ${BASE_COLS} FROM jd_jobs ORDER BY company ASC
      `).all()

  return NextResponse.json(jobs)
}

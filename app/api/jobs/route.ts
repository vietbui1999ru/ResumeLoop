import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export async function GET() {
  const jobs = getDb().prepare(`
    SELECT id, company, role_title, role_track, fit_pct, visa_status, tags
    FROM jd_jobs ORDER BY company ASC
  `).all()
  return NextResponse.json(jobs)
}

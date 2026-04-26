import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export async function GET() {
  const db = getDb()

  const total = (db.prepare('SELECT COUNT(*) as n FROM jd_jobs').get() as { n: number }).n
  const visaKill = (db.prepare("SELECT COUNT(*) as n FROM jd_jobs WHERE visa_status='kill'").get() as { n: number }).n

  const trackRows = db.prepare(`
    SELECT role_track, COUNT(*) as count FROM jd_jobs
    WHERE role_track IS NOT NULL GROUP BY role_track ORDER BY count DESC
  `).all() as Array<{ role_track: string; count: number }>
  const role_track_dist = Object.fromEntries(trackRows.map(r => [r.role_track, r.count]))

  const fitRows = db.prepare('SELECT fit_pct FROM jd_jobs WHERE fit_pct IS NOT NULL')
    .all() as Array<{ fit_pct: number }>
  const buckets: Record<string, number> = {}
  for (let i = 0; i <= 9; i++) buckets[`${i * 10}-${i * 10 + 9}`] = 0
  for (const { fit_pct } of fitRows) {
    const b = `${Math.floor(fit_pct / 10) * 10}-${Math.floor(fit_pct / 10) * 10 + 9}`
    buckets[b] = (buckets[b] ?? 0) + 1
  }

  const outputs = db.prepare(`
    SELECT o.*, j.company, j.role_title, j.role_track, j.fit_pct as job_fit
    FROM jd_outputs o JOIN jd_jobs j ON o.job_id = j.id
    ORDER BY o.built_at DESC LIMIT 50
  `).all()

  db.prepare(`
    INSERT INTO jd_metrics (computed_at, total_jobs, visa_kill_count, role_track_dist, fit_dist)
    VALUES (CURRENT_TIMESTAMP, ?, ?, ?, ?)
  `).run(total, visaKill, JSON.stringify(role_track_dist), JSON.stringify(buckets))

  return NextResponse.json({ total, visaKill, role_track_dist, fit_dist: buckets, outputs })
}

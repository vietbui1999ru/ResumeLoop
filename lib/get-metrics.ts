import { getDb } from './db'
import type { Output } from '@/components/OutputHistoryTable'

export interface MetricsResult {
  total: number
  visaKill: number
  role_track_dist: Record<string, number>
  fit_dist: Record<string, number>
  outputs: Output[]
  pipeline: {
    scraped: number; visa_kill: number; pending: number; resume_built: number
    applied: number; interviewed: number; rejected: number; offer: number
  }
}

export function computeMetrics(db = getDb()): MetricsResult {

  const total = (db.prepare('SELECT COUNT(*) as n FROM jd_jobs').get() as { n: number }).n
  const visaKill = (db.prepare("SELECT COUNT(*) as n FROM jd_jobs WHERE visa_status='kill'").get() as { n: number }).n

  const trackRows = db.prepare(`
    SELECT role_track, COUNT(*) as count FROM jd_jobs
    WHERE role_track IS NOT NULL GROUP BY role_track ORDER BY count DESC
  `).all() as Array<{ role_track: string; count: number }>
  const role_track_dist = Object.fromEntries(trackRows.map(r => [r.role_track, r.count]))

  const fitRows = db.prepare('SELECT fit_pct FROM jd_jobs WHERE fit_pct IS NOT NULL')
    .all() as Array<{ fit_pct: number }>
  const fit_dist: Record<string, number> = {}
  for (let i = 0; i <= 9; i++) fit_dist[`${i * 10}-${i * 10 + 9}`] = 0
  for (const { fit_pct } of fitRows) {
    const b = `${Math.floor(fit_pct / 10) * 10}-${Math.floor(fit_pct / 10) * 10 + 9}`
    fit_dist[b] = (fit_dist[b] ?? 0) + 1
  }

  const outputs = db.prepare(`
    SELECT o.*, j.company, j.role_title, j.role_track, j.fit_pct as job_fit
    FROM jd_outputs o JOIN jd_jobs j ON o.job_id = j.id
    ORDER BY o.built_at DESC LIMIT 50
  `).all() as Output[]

  const actionRows = db.prepare('SELECT action FROM jd_jobs').all() as Array<{ action: string | null }>
  const pipeline = { scraped: total, visa_kill: visaKill, pending: 0, resume_built: 0, applied: 0, interviewed: 0, rejected: 0, offer: 0 }
  for (const { action } of actionRows) {
    const a = action ?? '0-Saved'
    if (a === '0-Saved') { pipeline.pending++; continue }
    // Everything from 1-Applied onward has had a resume built and been applied
    pipeline.resume_built++
    pipeline.applied++
    if (a === '2-Phone Screen' || a === '3-Interview' || a === '4-Offer' || a === '5-Rejected') pipeline.interviewed++
    if (a === '4-Offer')    pipeline.offer++
    if (a === '5-Rejected') pipeline.rejected++
    // 6-Ghosted: counted in applied but not interviewed → becomes no_response in Sankey
  }

  db.prepare(`
    INSERT INTO jd_metrics (computed_at, total_jobs, visa_kill_count, role_track_dist, fit_dist)
    VALUES (CURRENT_TIMESTAMP, ?, ?, ?, ?)
  `).run(total, visaKill, JSON.stringify(role_track_dist), JSON.stringify(fit_dist))

  return { total, visaKill, role_track_dist, fit_dist, outputs, pipeline }
}

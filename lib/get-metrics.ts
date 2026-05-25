import { unstable_cache } from 'next/cache'
import { getAdapter, type DbAdapter } from './db-adapter'
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

async function _computeMetrics(adapterOrUserId?: DbAdapter | string, userIdArg?: string): Promise<MetricsResult> {
  // Back-compat overload: existing tests call computeMetrics(adapter); production calls computeMetrics(userId).
  let adapter: DbAdapter | undefined
  let userId = 'default'
  if (typeof adapterOrUserId === 'string') {
    userId = adapterOrUserId
  } else if (adapterOrUserId) {
    adapter = adapterOrUserId
    if (userIdArg) userId = userIdArg
  }
  const db = adapter ?? (await getAdapter())

  const totalRow = await db.queryOne<{ n: number }>(
    'SELECT COUNT(*) as n FROM jd_jobs WHERE user_id = ?',
    [userId],
  )
  const total = Number(totalRow?.n ?? 0)

  const visaRow = await db.queryOne<{ n: number }>(
    "SELECT COUNT(*) as n FROM jd_jobs WHERE visa_status='kill' AND user_id = ?",
    [userId],
  )
  const visaKill = Number(visaRow?.n ?? 0)

  const trackRows = await db.query<{ role_track: string; count: number }>(`
    SELECT role_track, COUNT(*) as count FROM jd_jobs
    WHERE role_track IS NOT NULL AND user_id = ? GROUP BY role_track ORDER BY count DESC
  `, [userId])
  const role_track_dist = Object.fromEntries(trackRows.map(r => [r.role_track, Number(r.count)]))

  const fitRows = await db.query<{ fit_pct: number }>(
    'SELECT fit_pct FROM jd_jobs WHERE fit_pct IS NOT NULL AND user_id = ?',
    [userId],
  )
  const fit_dist: Record<string, number> = {}
  for (let i = 0; i <= 9; i++) fit_dist[`${i * 10}-${i * 10 + 9}`] = 0
  for (const { fit_pct } of fitRows) {
    const b = `${Math.floor(fit_pct / 10) * 10}-${Math.floor(fit_pct / 10) * 10 + 9}`
    fit_dist[b] = (fit_dist[b] ?? 0) + 1
  }

  const outputs = await db.query<Output>(`
    SELECT o.*, j.company, j.role_title, j.role_track, j.fit_pct as job_fit
    FROM jd_outputs o JOIN jd_jobs j ON o.job_id = j.id
    WHERE j.user_id = ?
    ORDER BY o.built_at DESC LIMIT 50
  `, [userId])

  const actionRows = await db.query<{ action: string | null }>(
    'SELECT action FROM jd_jobs WHERE user_id = ?',
    [userId],
  )
  const pipeline = { scraped: total, visa_kill: visaKill, pending: 0, resume_built: 0, applied: 0, interviewed: 0, rejected: 0, offer: 0 }
  for (const { action } of actionRows) {
    const a = action ?? '0-Saved'
    if (a === '0-Saved') { pipeline.pending++; continue }
    pipeline.resume_built++
    pipeline.applied++
    if (a === '2-Phone Screen' || a === '3-Interview' || a === '4-Offer' || a === '5-Rejected') pipeline.interviewed++
    if (a === '4-Offer')    pipeline.offer++
    if (a === '5-Rejected') pipeline.rejected++
  }

  await db.run(`
    INSERT INTO jd_metrics (computed_at, total_jobs, visa_kill_count, role_track_dist, fit_dist, user_id)
    VALUES (CURRENT_TIMESTAMP, ?, ?, ?, ?, ?)
  `, [total, visaKill, JSON.stringify(role_track_dist), JSON.stringify(fit_dist), userId])

  return { total, visaKill, role_track_dist, fit_dist, outputs, pipeline }
}

// computeMetrics: cached when called with a userId string (dashboard path).
// When called with a DbAdapter (test path), runs uncached to avoid Next.js cache context issues.
export async function computeMetrics(adapterOrUserId?: DbAdapter | string, userIdArg?: string): Promise<MetricsResult> {
  if (typeof adapterOrUserId === 'string') {
    const userId = adapterOrUserId
    const cached = unstable_cache(
      () => _computeMetrics(userId),
      [`metrics-${userId}`],
      { revalidate: 60, tags: [`metrics-${userId}`] },
    )
    return cached()
  }
  return _computeMetrics(adapterOrUserId, userIdArg)
}


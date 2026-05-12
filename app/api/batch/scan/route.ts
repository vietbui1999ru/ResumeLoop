import { NextResponse } from 'next/server'
import { revalidatePath, revalidateTag } from 'next/cache'
import fs from 'fs'
import path from 'path'
import { auth } from '@/lib/auth'
import { getAdapter } from '@/lib/db-adapter'
import { getSetting } from '@/lib/settings'
import { parseJd } from '@/lib/jd-parser'
import { scoreJd } from '@/lib/fit-scorer'

export async function POST() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = session.user.id

  const jobsDir = await getSetting('jobs_path')
  if (!jobsDir || !fs.existsSync(jobsDir)) {
    return NextResponse.json({ error: `Jobs folder not found: ${jobsDir}. Set it in Settings.` }, { status: 400 })
  }

  const db = await getAdapter()
  const files = fs.readdirSync(jobsDir).filter(f => f.endsWith('.md'))

  // Snapshot existing file_mtime + clipped_at — skip only if mtime matches AND clipped_at is already set
  const stored = await db.query<{ file_path: string; file_mtime: string | null; clipped_at: string | null }>(
    'SELECT file_path, file_mtime, clipped_at FROM jd_jobs WHERE user_id = ?',
    [userId],
  )
  const storedMeta = new Map(stored.map(r => [r.file_path, r]))

  type Row = ReturnType<typeof parseJd> & { role_track: string; fit_pct: number; file_mtime: string }
  const rows: Row[] = []
  let skipped = 0
  let unchanged = 0

  for (const file of files) {
    try {
      const filePath = path.join(jobsDir, file)
      const file_mtime = fs.statSync(filePath).mtime.toISOString()
      const meta = storedMeta.get(filePath)
      if (meta?.file_mtime === file_mtime && meta?.clipped_at != null) { unchanged++; continue }

      const content = fs.readFileSync(filePath, 'utf8')
      const parsed = parseJd(filePath, content)
      const { role_track, fit_pct } = scoreJd(parsed.raw_content)
      rows.push({ ...parsed, role_track, fit_pct, file_mtime })
    } catch {
      skipped++
    }
  }

  const upsertSql = `
    INSERT INTO jd_jobs (id, file_path, company, role_title, tags, visa_status, action, role_track, fit_pct, raw_content, file_mtime, clipped_at, apply_url, user_id, scanned_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(id) DO UPDATE SET
      file_path   = excluded.file_path,
      tags        = excluded.tags,
      visa_status = excluded.visa_status,
      action      = COALESCE(excluded.action, jd_jobs.action),
      role_track  = excluded.role_track,
      fit_pct     = excluded.fit_pct,
      raw_content = excluded.raw_content,
      file_mtime  = excluded.file_mtime,
      clipped_at  = COALESCE(excluded.clipped_at, jd_jobs.clipped_at),
      apply_url   = COALESCE(jd_jobs.apply_url, excluded.apply_url),
      user_id     = excluded.user_id,
      scanned_at  = CURRENT_TIMESTAMP
  `

  for (const r of rows) {
    await db.run(upsertSql, [
      r.id, r.file_path, r.company, r.role_title, r.tags, r.visa_status, r.action,
      r.role_track, r.fit_pct, r.raw_content, r.file_mtime, r.clipped_at, r.apply_url, userId,
    ])
  }

  // Bust dashboard metrics cache so next visit reflects new scan results.
  revalidateTag(`metrics-${userId}`)
  revalidatePath('/')

  return NextResponse.json({ scanned: rows.length, unchanged, skipped })
}

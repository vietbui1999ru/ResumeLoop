import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import { getDb } from '@/lib/db'
import { getSetting } from '@/lib/settings'
import { parseJd } from '@/lib/jd-parser'
import { scoreJd } from '@/lib/fit-scorer'

export async function POST() {
  const jobsDir = getSetting('jobs_path')
  if (!jobsDir || !fs.existsSync(jobsDir)) {
    return NextResponse.json({ error: `Jobs folder not found: ${jobsDir}. Set it in Settings.` }, { status: 400 })
  }

  const db = getDb()
  const files = fs.readdirSync(jobsDir).filter(f => f.endsWith('.md'))

  const upsert = db.prepare(`
    INSERT INTO jd_jobs (id, file_path, company, role_title, tags, visa_status, role_track, fit_pct, raw_content, file_mtime, scanned_at)
    VALUES (@id, @file_path, @company, @role_title, @tags, @visa_status, @role_track, @fit_pct, @raw_content, @file_mtime, CURRENT_TIMESTAMP)
    ON CONFLICT(id) DO UPDATE SET
      file_path   = excluded.file_path,
      tags        = excluded.tags,
      visa_status = excluded.visa_status,
      role_track  = excluded.role_track,
      fit_pct     = excluded.fit_pct,
      raw_content = excluded.raw_content,
      file_mtime  = excluded.file_mtime,
      scanned_at  = CURRENT_TIMESTAMP
  `)

  type Row = ReturnType<typeof parseJd> & { role_track: string; fit_pct: number; file_mtime: string }
  const rows: Row[] = []
  let skipped = 0

  for (const file of files) {
    try {
      const filePath = path.join(jobsDir, file)
      const content = fs.readFileSync(filePath, 'utf8')
      const parsed = parseJd(filePath, content)
      const { role_track, fit_pct } = scoreJd(parsed.raw_content)
      const file_mtime = fs.statSync(filePath).mtime.toISOString()
      rows.push({ ...parsed, role_track, fit_pct, file_mtime })
    } catch {
      skipped++
    }
  }

  const scanAll = db.transaction((rs: Row[]) => {
    for (const r of rs) upsert.run(r)
  })
  scanAll(rows)

  return NextResponse.json({ scanned: rows.length, skipped })
}

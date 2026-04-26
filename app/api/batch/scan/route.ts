import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import { getDb } from '@/lib/db'
import { parseJd } from '@/lib/jd-parser'
import { scoreJd } from '@/lib/fit-scorer'

export async function POST() {
  const jobsDir = process.env.OBSIDIAN_JOBS_PATH
  if (!jobsDir || !fs.existsSync(jobsDir)) {
    return NextResponse.json({ error: 'OBSIDIAN_JOBS_PATH not set or directory not found' }, { status: 400 })
  }

  const db = getDb()
  const files = fs.readdirSync(jobsDir).filter(f => f.endsWith('.md'))

  const upsert = db.prepare(`
    INSERT INTO jd_jobs (id, file_path, company, role_title, tags, visa_status, role_track, fit_pct, raw_content, scanned_at)
    VALUES (@id, @file_path, @company, @role_title, @tags, @visa_status, @role_track, @fit_pct, @raw_content, CURRENT_TIMESTAMP)
    ON CONFLICT(id) DO UPDATE SET
      file_path   = excluded.file_path,
      tags        = excluded.tags,
      visa_status = excluded.visa_status,
      role_track  = excluded.role_track,
      fit_pct     = excluded.fit_pct,
      raw_content = excluded.raw_content,
      scanned_at  = CURRENT_TIMESTAMP
  `)

  const rows = files.map(file => {
    const filePath = path.join(jobsDir, file)
    const content = fs.readFileSync(filePath, 'utf8')
    const parsed = parseJd(filePath, content)
    const { role_track, fit_pct } = scoreJd(parsed.raw_content)
    return { ...parsed, role_track, fit_pct }
  })

  const scanAll = db.transaction((rs: typeof rows) => {
    for (const r of rs) upsert.run(r)
  })
  scanAll(rows)

  return NextResponse.json({ scanned: rows.length })
}

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { getAdapter } from '@/lib/db-adapter'
import { isCloud } from '@/lib/app-mode'

const BASE_COLS = `
  j.id, j.company, j.role_title, j.role_track, j.fit_pct, j.visa_status,
  j.tags, j.action, j.file_mtime, j.clipped_at, j.scanned_at, j.hidden,
  EXISTS(SELECT 1 FROM jd_outputs WHERE job_id = j.id AND reasoning IS NOT NULL) as has_reasoning,
  EXISTS(SELECT 1 FROM jd_outputs WHERE job_id = j.id) as has_output
`

export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = session.user.id

  const sp         = new URL(req.url).searchParams
  const q          = sp.get('q')?.trim() ?? ''
  const showHidden = sp.get('showHidden') === '1'
  const fitMin     = Number(sp.get('fitMin') ?? 0)
  const track      = sp.get('track')?.trim() ?? ''
  const visa       = (sp.get('visa') ?? 'proceed') as 'all' | 'proceed' | 'kill'
  const action     = sp.get('action')?.trim() ?? ''
  const tag        = sp.get('tag')?.trim() ?? ''
  const fromDate   = sp.get('fromDate')?.trim() ?? ''

  const conditions: string[] = ['j.user_id = ?']
  const params: unknown[]    = [userId]

  if (!showHidden)              { conditions.push('j.hidden = 0') }
  if (fitMin > 0)               { conditions.push('j.fit_pct >= ?');                          params.push(fitMin) }
  if (track)                    { conditions.push('j.role_track = ?');                        params.push(track) }
  if (visa === 'proceed')       { conditions.push("(j.visa_status IS NULL OR j.visa_status != 'kill')") }
  if (visa === 'kill')          { conditions.push("j.visa_status = 'kill'") }
  if (action)                   { conditions.push('j.action = ?');                            params.push(action) }
  if (tag)                      { conditions.push("','||COALESCE(j.tags,'')||',' LIKE ?");    params.push(`%,${tag},%`) }

  // clipped_at is TEXT, scanned_at is TIMESTAMPTZ — Postgres rejects mixed COALESCE without cast.
  const dateExpr = isCloud()
    ? 'COALESCE(j.clipped_at::timestamptz, j.scanned_at)'
    : 'COALESCE(j.clipped_at, j.scanned_at)'

  if (fromDate) { conditions.push(`${dateExpr} >= ?`); params.push(fromDate) }

  const where = conditions.join(' AND ')
  const db    = await getAdapter()

  let jobs: unknown[]
  if (q) {
    if (!isCloud()) {
      // SQLite: FTS5 MATCH for full-text search
      jobs = await db.query(`
        SELECT ${BASE_COLS}
        FROM jd_jobs j
        JOIN jd_jobs_fts ON jd_jobs_fts.rowid = j.rowid
        WHERE ${where}
          AND jd_jobs_fts MATCH ?
        ORDER BY ${dateExpr} DESC
      `, [...params, q.split(/\s+/).map(t => `"${t.replace(/"/g, '')}"`).join(' ')])
    } else {
      // Neon/Postgres: ILIKE fallback
      conditions.push('(j.company ILIKE ? OR j.role_title ILIKE ? OR j.raw_content ILIKE ?)')
      params.push(`%${q}%`, `%${q}%`, `%${q}%`)
      jobs = await db.query(`
        SELECT ${BASE_COLS} FROM jd_jobs j
        WHERE ${conditions.join(' AND ')}
        ORDER BY ${dateExpr} DESC
      `, params)
    }
  } else {
    jobs = await db.query(`
      SELECT ${BASE_COLS} FROM jd_jobs j
      WHERE ${where}
      ORDER BY ${dateExpr} DESC
    `, params)
  }

  return NextResponse.json(jobs)
}

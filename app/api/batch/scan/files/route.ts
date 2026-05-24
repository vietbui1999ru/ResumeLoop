import { NextResponse } from 'next/server'
import { revalidatePath, revalidateTag } from 'next/cache'
import { auth } from '@/lib/auth'
import { getAdapter } from '@/lib/db-adapter'
import { parseJd } from '@/lib/jd-parser'
import { scoreJd } from '@/lib/fit-scorer'

const MAX_FILE_BYTES  = 256 * 1024  // 256 KB per file — JDs are never this large
const MAX_FILE_COUNT  = 500         // cap per scan to prevent DoS
const MAX_BODY_BYTES  = 32 * 1024 * 1024  // 32 MB total body

interface UploadedFile {
  name: string    // filename like "stripe-swe.md"
  content: string // full file content
}

// Strip null bytes and non-printable control characters (keep tab/newline/CR).
function sanitizeContent(raw: string): string {
  // eslint-disable-next-line no-control-regex
  return raw.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '')
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = session.user.id

  // Enforce total body size before parsing JSON
  const contentLength = Number(req.headers.get('content-length') ?? 0)
  if (contentLength > MAX_BODY_BYTES) {
    return NextResponse.json({ error: 'Request body too large' }, { status: 413 })
  }

  const body: { files?: UploadedFile[] } = await req.json()
  if (!Array.isArray(body?.files)) {
    return NextResponse.json({ error: 'files array required' }, { status: 400 })
  }

  const mdFiles = body.files
    .filter(f => typeof f.name === 'string' && f.name.endsWith('.md') && typeof f.content === 'string')
    .slice(0, MAX_FILE_COUNT)

  if (mdFiles.length === 0) {
    return NextResponse.json({ ok: true, processed: 0, skipped: 0, unchanged: 0 })
  }

  const db = await getAdapter()

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
      clipped_at  = COALESCE(excluded.clipped_at, jd_jobs.clipped_at),
      apply_url   = COALESCE(jd_jobs.apply_url, excluded.apply_url),
      user_id     = excluded.user_id,
      scanned_at  = CURRENT_TIMESTAMP
  `

  let processed = 0
  let skipped = 0
  const failed: string[] = []

  for (const file of mdFiles) {
    try {
      // Enforce per-file size limit
      if (Buffer.byteLength(file.content, 'utf8') > MAX_FILE_BYTES) {
        failed.push(file.name)
        skipped++
        continue
      }

      const cleanContent = sanitizeContent(file.content)

      // Use filename as the "path" — gives deterministic ID and company name extraction
      const parsed = parseJd(file.name, cleanContent)
      const { role_track, fit_pct } = scoreJd(parsed.raw_content)

      await db.run(upsertSql, [
        parsed.id, parsed.file_path, parsed.company, parsed.role_title,
        parsed.tags, parsed.visa_status, parsed.action,
        role_track, fit_pct, parsed.raw_content,
        null, // file_mtime — no mtime for uploaded files
        parsed.clipped_at, parsed.apply_url, userId,
      ])
      processed++
    } catch {
      failed.push(file.name)
      skipped++
    }
  }

  revalidateTag(`metrics-${userId}`)
  revalidatePath('/')

  return NextResponse.json({ ok: true, processed, skipped, unchanged: 0, failed })
}

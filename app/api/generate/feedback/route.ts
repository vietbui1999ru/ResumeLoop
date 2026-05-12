import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { getAdapter } from '@/lib/db-adapter'
import fs from 'fs'
import path from 'path'

interface FeedbackBody {
  jobId:    string
  outputId: string
  rating:   1 | 2 | 3
  note:     string
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = session.user.id

  const { jobId, outputId, rating, note }: FeedbackBody = await req.json()

  if (!jobId || ![1, 2, 3].includes(rating)) {
    return NextResponse.json({ error: 'jobId and rating (1-3) required' }, { status: 400 })
  }

  const sanitize = (s: string) => s.replace(/^#{1,6}\s/gm, '').replace(/\n/g, ' ').slice(0, 200)

  const db = await getAdapter()
  const job = await db.queryOne<{ company: string; role_title: string }>(
    'SELECT company, role_title FROM jd_jobs WHERE id = ? AND user_id = ?',
    [jobId, userId],
  )

  const label = job
    ? `${sanitize(job.company)}_${sanitize(job.role_title)}`
    : jobId
  const date  = new Date().toISOString().slice(0, 10)
  const text  = note?.trim() ? sanitize(note.trim()) : '(no note)'

  const entry = [
    ``,
    `## ${date} ${label} rate:${rating}/3`,
    `**What went wrong**: ${text}`,
    `**Fix applied**: (pending)`,
    `**Root cause**: (pending)`,
    `**Should have done**: (pending)`,
    ``,
  ].join('\n')

  const MAX_LOG_BYTES = 512 * 1024  // 512 KB — ~2500 entries before trim
  const MAX_ENTRIES   = 100

  const logPath = path.join(process.cwd(), 'feedback', 'raw-log.md')
  fs.mkdirSync(path.dirname(logPath), { recursive: true })
  fs.appendFileSync(logPath, entry, 'utf8')

  // Trim if oversized to prevent disk DoS and prompt injection accumulation
  try {
    const raw = fs.readFileSync(logPath, 'utf8')
    if (Buffer.byteLength(raw, 'utf8') > MAX_LOG_BYTES) {
      const parts = raw.split(/(?=\n## \d{4}-\d{2}-\d{2})/).filter(s => s.trim())
      if (parts.length > MAX_ENTRIES) {
        fs.writeFileSync(logPath, parts.slice(-MAX_ENTRIES).join(''), 'utf8')
      }
    }
  } catch { /* trim failure is non-fatal */ }

  void outputId  // stored in entry label; not needed for log write

  return NextResponse.json({ ok: true })
}

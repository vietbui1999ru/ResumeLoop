import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import fs from 'fs'
import path from 'path'

interface FeedbackBody {
  jobId:    string
  outputId: string
  rating:   1 | 2 | 3
  note:     string
}

export async function POST(req: Request) {
  const { jobId, outputId, rating, note }: FeedbackBody = await req.json()

  if (!jobId || ![1, 2, 3].includes(rating)) {
    return NextResponse.json({ error: 'jobId and rating (1-3) required' }, { status: 400 })
  }

  const job = getDb().prepare(
    'SELECT company, role_title FROM jd_jobs WHERE id = ?'
  ).get(jobId) as { company: string; role_title: string } | undefined

  const label = job ? `${job.company}_${job.role_title}` : jobId
  const date  = new Date().toISOString().slice(0, 10)
  const text  = note?.trim() || '(no note)'

  const entry = [
    ``,
    `## ${date} ${label} rate:${rating}/3`,
    `**What went wrong**: ${text}`,
    `**Fix applied**: (pending)`,
    `**Root cause**: (pending)`,
    `**Should have done**: (pending)`,
    ``,
  ].join('\n')

  const logPath = path.join(process.cwd(), 'feedback', 'raw-log.md')
  fs.mkdirSync(path.dirname(logPath), { recursive: true })
  fs.appendFileSync(logPath, entry, 'utf8')

  void outputId  // stored in entry label; not needed for log write

  return NextResponse.json({ ok: true })
}

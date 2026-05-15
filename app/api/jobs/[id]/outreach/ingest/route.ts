import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { auth } from '@/lib/auth'
import { getAdapter } from '@/lib/db-adapter'
import { validateIngestPath } from '@/lib/settings'
import {
  generateCard,
  createOutreachItem,
  type OutreachItem,
  type OutreachKind,
} from '@/lib/outreach'

function safePath(p: string): string {
  if (p.startsWith('~/')) return path.join(os.homedir(), p.slice(2))
  return path.resolve(p)
}

function inferKind(markdown: string): OutreachKind {
  const lc = markdown.toLowerCase()
  if (lc.includes('experience') || lc.includes('skills')) return 'person'
  return 'company'
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = session.user.id
  const { id: jobId } = await params

  const db = await getAdapter()
  const job = await db.queryOne<{ company: string; role_title: string }>(
    'SELECT company, role_title FROM jd_jobs WHERE id = ? AND user_id = ?',
    [jobId, userId],
  )
  if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 })

  const { paths }: { paths: string[] } = await req.json()
  if (!Array.isArray(paths) || paths.length === 0) {
    return NextResponse.json({ error: 'paths array required' }, { status: 400 })
  }

  const created: OutreachItem[] = []
  for (const rawPath of paths) {
    let resolved: string
    try {
      resolved = await validateIngestPath(safePath(rawPath))
    } catch (e) {
      return NextResponse.json({ error: `Unsafe path: ${(e as Error).message}` }, { status: 400 })
    }

    if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
      return NextResponse.json({ error: 'File not found' }, { status: 400 })
    }

    const rawMarkdown = fs.readFileSync(resolved, 'utf-8')
    const kind = inferKind(rawMarkdown)
    const jobContext = { company: job.company ?? '', role_title: job.role_title ?? '' }

    let card
    try {
      card = await generateCard(rawMarkdown, kind, jobContext, userId)
    } catch (e) {
      return NextResponse.json({ error: `Card generation failed: ${(e as Error).message}` }, { status: 502 })
    }

    const item = await createOutreachItem({
      job_id:        jobId,
      user_id:       userId,
      kind,
      raw_markdown:  rawMarkdown,
      ai_card:       JSON.stringify(card),
      role:          null,
      role_custom:   null,
      notes:         null,
      email:         card.email_guess ?? null,
      status:        'not_contacted',
      linkedin_draft: null,
      email_draft:   null,
      source_path:   resolved,
    })
    created.push(item)
  }

  return NextResponse.json({ items: created })
}

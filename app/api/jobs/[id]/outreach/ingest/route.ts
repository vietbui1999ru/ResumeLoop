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

// Strip Obsidian Web Clipper schema comment block and reconstruct with only
// fields useful for AI card extraction (drops tags, created — keeps title + body).
function cleanOutreachMarkdown(raw: string): string {
  // Remove <!-- --> blocks (Web Clipper schema metadata)
  const stripped = raw.replace(/<!--[\s\S]*?-->/g, '').trim()

  // Re-parse frontmatter to drop internal tracking fields before AI sees them
  const fmMatch = stripped.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/)
  if (!fmMatch) return stripped

  const fmLines = fmMatch[1].split('\n')
  const KEEP = new Set(['title', 'name', 'role', 'company'])
  const keptFm = fmLines.filter(line => {
    const key = line.split(':')[0]?.trim().toLowerCase()
    return key ? KEEP.has(key) : false
  })

  const body = fmMatch[2].trim()
  if (keptFm.length === 0) return body
  return `---\n${keptFm.join('\n')}\n---\n\n${body}`
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

  const body = await req.json() as { paths?: string[]; text?: string }
  const jobContext = { company: job.company ?? '', role_title: job.role_title ?? '' }

  async function processMarkdown(rawInput: string, sourcePath: string | null): Promise<OutreachItem> {
    const rawMarkdown = cleanOutreachMarkdown(rawInput)
    const kind = inferKind(rawMarkdown)
    let card
    try {
      card = await generateCard(rawMarkdown, kind, jobContext, userId)
    } catch (e) {
      throw new Error(`Card generation failed: ${(e as Error).message}`)
    }
    return createOutreachItem({
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
      source_path:   sourcePath,
    })
  }

  // Inline text path
  if (body.text) {
    if (typeof body.text !== 'string' || !body.text.trim()) {
      return NextResponse.json({ error: 'text must be a non-empty string' }, { status: 400 })
    }
    try {
      const item = await processMarkdown(body.text, null)
      return NextResponse.json({ items: [item] })
    } catch (e) {
      return NextResponse.json({ error: (e as Error).message }, { status: 502 })
    }
  }

  // File paths path
  const paths = body.paths
  if (!Array.isArray(paths) || paths.length === 0) {
    return NextResponse.json({ error: 'paths array or text string required' }, { status: 400 })
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

    try {
      const item = await processMarkdown(fs.readFileSync(resolved, 'utf-8'), resolved)
      created.push(item)
    } catch (e) {
      return NextResponse.json({ error: (e as Error).message }, { status: 502 })
    }
  }

  return NextResponse.json({ items: created })
}

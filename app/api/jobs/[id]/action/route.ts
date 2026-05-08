import { NextResponse } from 'next/server'
import fs from 'fs'
import matter from 'gray-matter'
import { getDb } from '@/lib/db'
import { VALID_ACTIONS } from '@/lib/actions'

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json() as { action?: string }
  const action = body.action

  if (!action || !(VALID_ACTIONS as readonly string[]).includes(action)) {
    return NextResponse.json({ error: `Invalid action. Must be one of: ${VALID_ACTIONS.join(', ')}` }, { status: 400 })
  }

  const db = getDb()
  const job = db.prepare('SELECT file_path FROM jd_jobs WHERE id = ?').get(id) as { file_path: string } | undefined
  if (!job) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  try {
    const fileContent = fs.readFileSync(job.file_path, 'utf8')
    const { data: fm, content } = matter(fileContent)
    fm.Action = action
    fs.writeFileSync(job.file_path, matter.stringify(content, fm), 'utf8')
  } catch (err) {
    return NextResponse.json({ error: `File write failed: ${(err as Error).message}` }, { status: 500 })
  }

  db.prepare('UPDATE jd_jobs SET action = ? WHERE id = ?').run(action, id)
  return NextResponse.json({ ok: true })
}

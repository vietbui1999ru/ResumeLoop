import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import matter from 'gray-matter'
import { auth } from '@/lib/auth'
import { getAdapter } from '@/lib/db-adapter'
import { getSetting } from '@/lib/settings'
import { VALID_ACTIONS } from '@/lib/actions'

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = session.user.id

  const { id } = await params
  const body = await req.json() as { action?: string }
  const action = body.action

  if (!action || !(VALID_ACTIONS as readonly string[]).includes(action)) {
    return NextResponse.json({ error: `Invalid action. Must be one of: ${VALID_ACTIONS.join(', ')}` }, { status: 400 })
  }

  const db = await getAdapter()
  const job = await db.queryOne<{ file_path: string }>(
    'SELECT file_path FROM jd_jobs WHERE id = ? AND user_id = ?',
    [id, userId],
  )
  if (!job) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  let realFilePath: string
  try {
    const jobsDir = fs.realpathSync(await getSetting('jobs_path'))
    realFilePath  = fs.realpathSync(job.file_path)
    if (!realFilePath.startsWith(jobsDir + path.sep)) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
  } catch {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  try {
    const fileContent = fs.readFileSync(realFilePath, 'utf8')
    const { data: fm, content } = matter(fileContent)
    fm.Action = action
    fs.writeFileSync(realFilePath, matter.stringify(content, fm), 'utf8')
  } catch {
    return NextResponse.json({ error: 'File write failed' }, { status: 500 })
  }

  await db.run('UPDATE jd_jobs SET action = ? WHERE id = ? AND user_id = ?', [action, id, userId])
  return NextResponse.json({ ok: true })
}

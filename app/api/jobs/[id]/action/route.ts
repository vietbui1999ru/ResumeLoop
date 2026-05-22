import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import matter from 'gray-matter'
import { auth } from '@/lib/auth'
import { getAdapter } from '@/lib/db-adapter'
import { getSetting } from '@/lib/settings'
import { VALID_ACTIONS } from '@/lib/actions'
import { isCloud } from '@/lib/app-mode'

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

  // Frontmatter sync is local-only and skipped for pasted jobs (no backing file).
  // Cloud deployments have no access to the user's filesystem.
  if (!isCloud() && job.file_path !== 'pasted') {
    try {
      const jobsDir  = fs.realpathSync(await getSetting('jobs_path'))
      const realPath = fs.realpathSync(job.file_path)
      if (!realPath.startsWith(jobsDir + path.sep)) {
        return NextResponse.json({ error: 'Not found' }, { status: 404 })
      }
      const { data: fm, content } = matter(fs.readFileSync(realPath, 'utf8'))
      fm.Action = action
      fs.writeFileSync(realPath, matter.stringify(content, fm), 'utf8')
    } catch {
      // File moved or deleted — skip frontmatter sync, DB update below still applies
    }
  }

  await db.run('UPDATE jd_jobs SET action = ? WHERE id = ? AND user_id = ?', [action, id, userId])
  return NextResponse.json({ ok: true })
}

import fs from 'fs'
import { NextResponse } from 'next/server'
import { getAdapter } from '@/lib/db-adapter'
import { FILE_MAP } from '@/lib/chat-tools'
import { updateSessionData } from '@/lib/sessions'
import { auth } from '@/lib/auth'

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = session.user.id

  const { sessionId, accept, file } = (await req.json()) as { sessionId: string; accept: boolean; file: string }
  if (!sessionId || !file) return NextResponse.json({ error: 'sessionId and file required' }, { status: 400 })

  const db = await getAdapter()
  const pendingKey = `pending_edit:${userId}:${sessionId}:${file}`
  const row = await db.queryOne<{ value: string }>(
    'SELECT value FROM app_settings WHERE key = ?',
    [pendingKey],
  )

  if (!row) return NextResponse.json({ error: 'No pending edit' }, { status: 404 })

  const { description: _desc, new_content } = JSON.parse(row.value) as {
    file: string
    description: string
    new_content: string
  }

  if (!accept) {
    await db.run('DELETE FROM app_settings WHERE key = ?', [pendingKey])
    return NextResponse.json({ ok: true, applied: false })
  }

  const filePath = FILE_MAP[file]
  if (!filePath) return NextResponse.json({ error: 'Unknown file' }, { status: 400 })

  if (file === 'master_resume_data') {
    try {
      JSON.parse(new_content)
    } catch {
      return NextResponse.json({ error: 'Invalid JSON in proposed content' }, { status: 422 })
    }
    await updateSessionData(sessionId, new_content, userId)
    await db.run('DELETE FROM app_settings WHERE key = ?', [pendingKey])
    return NextResponse.json({ ok: true, applied: true, file })
  }

  const tmp = filePath + '.tmp'
  fs.writeFileSync(tmp, new_content, 'utf8')
  fs.renameSync(tmp, filePath)
  await db.run('DELETE FROM app_settings WHERE key = ?', [pendingKey])
  return NextResponse.json({ ok: true, applied: true, file })
}

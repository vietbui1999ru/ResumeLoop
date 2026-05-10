import fs from 'fs'
import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { FILE_MAP } from '@/lib/chat-tools'
import { updateSessionData } from '@/lib/sessions'

export async function POST(req: Request) {
  const { sessionId, accept, file } = (await req.json()) as { sessionId: string; accept: boolean; file: string }
  if (!sessionId || !file) return NextResponse.json({ error: 'sessionId and file required' }, { status: 400 })

  const pendingKey = `pending_edit:${sessionId}:${file}`
  const row = getDb()
    .prepare('SELECT value FROM app_settings WHERE key = ?')
    .get(pendingKey) as { value: string } | undefined

  if (!row) return NextResponse.json({ error: 'No pending edit' }, { status: 404 })

  const { description: _desc, new_content } = JSON.parse(row.value) as {
    file: string
    description: string
    new_content: string
  }

  if (!accept) {
    getDb().prepare('DELETE FROM app_settings WHERE key = ?').run(pendingKey)
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
    updateSessionData(sessionId, new_content)
    getDb().prepare('DELETE FROM app_settings WHERE key = ?').run(pendingKey)
    return NextResponse.json({ ok: true, applied: true, file })
  }

  const tmp = filePath + '.tmp'
  fs.writeFileSync(tmp, new_content, 'utf8')
  fs.renameSync(tmp, filePath)
  getDb().prepare('DELETE FROM app_settings WHERE key = ?').run(pendingKey)
  return NextResponse.json({ ok: true, applied: true, file })
}

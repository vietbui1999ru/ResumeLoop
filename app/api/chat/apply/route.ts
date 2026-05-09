import fs from 'fs'
import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { FILE_MAP } from '@/lib/chat-tools'

export async function POST(req: Request) {
  const { sessionId, accept } = (await req.json()) as { sessionId: string; accept: boolean }
  if (!sessionId) return NextResponse.json({ error: 'sessionId required' }, { status: 400 })

  const pendingKey = `pending_edit:${sessionId}`
  const row = getDb()
    .prepare('SELECT value FROM app_settings WHERE key = ?')
    .get(pendingKey) as { value: string } | undefined

  if (!row) return NextResponse.json({ error: 'No pending edit' }, { status: 404 })

  const { file, description: _desc, new_content } = JSON.parse(row.value) as {
    file: string
    description: string
    new_content: string
  }

  getDb().prepare('DELETE FROM app_settings WHERE key = ?').run(pendingKey)

  if (!accept) return NextResponse.json({ ok: true, applied: false })

  const filePath = FILE_MAP[file]
  if (!filePath) return NextResponse.json({ error: 'Unknown file' }, { status: 400 })

  if (file === 'master_resume_data') {
    try {
      JSON.parse(new_content)
    } catch {
      return NextResponse.json({ error: 'Invalid JSON in proposed content' }, { status: 422 })
    }
  }

  fs.writeFileSync(filePath, new_content, 'utf8')
  return NextResponse.json({ ok: true, applied: true, file })
}

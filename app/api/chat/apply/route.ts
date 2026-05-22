import { NextResponse } from 'next/server'
import { getAdapter } from '@/lib/db-adapter'
import { updateSessionData } from '@/lib/sessions'
import { auth } from '@/lib/auth'
import { checkRateLimitBucket } from '@/lib/rate-limit'

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = session.user.id

  if (!checkRateLimitBucket(`chat-apply:${userId}`, 30, 30)) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })
  }

  const { sessionId, accept, file } = (await req.json()) as { sessionId: string; accept: boolean; file: string }
  if (!sessionId || !file) return NextResponse.json({ error: 'sessionId and file required' }, { status: 400 })

  const db = await getAdapter()

  // Verify sessionId belongs to this user before applying any edit
  const realSessionId = sessionId === 'default' ? `default:${userId}` : sessionId
  const sess = await db.queryOne<{ id: string }>(
    'SELECT id FROM resume_sessions WHERE id = ? AND user_id = ?',
    [realSessionId, userId],
  )
  if (!sess) return NextResponse.json({ error: 'Session not found' }, { status: 404 })

  const pendingKey = `pending_edit:${userId}:${sessionId}:${file}`
  const row = await db.queryOne<{ value: string }>(
    'SELECT value FROM app_settings WHERE key = ?',
    [pendingKey],
  )

  if (!row) return NextResponse.json({ error: 'No pending edit' }, { status: 404 })

  const { description: _, new_content } = JSON.parse(row.value) as {
    file: string
    description: string
    new_content: string
  }

  if (!accept) {
    await db.run('DELETE FROM app_settings WHERE key = ?', [pendingKey])
    return NextResponse.json({ ok: true, applied: false })
  }

  // Only master_resume_data is an editable file; any other key is a misconfiguration
  if (file !== 'master_resume_data') {
    return NextResponse.json({ error: 'Unknown file' }, { status: 400 })
  }

  try {
    JSON.parse(new_content)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON in proposed content' }, { status: 422 })
  }

  await updateSessionData(sessionId, new_content, userId)
  await db.run('DELETE FROM app_settings WHERE key = ?', [pendingKey])
  return NextResponse.json({ ok: true, applied: true, file })
}

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { getAdapter } from '@/lib/db-adapter'

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = session.user.id

  const db = await getAdapter()
  const sessions = await db.query(`
    SELECT
      session_id,
      MIN(created_at) as started_at,
      MAX(created_at) as last_at,
      (SELECT content FROM chat_messages m2
       WHERE m2.session_id = m.session_id AND m2.role = 'user' AND m2.user_id = ?
       ORDER BY created_at ASC LIMIT 1) as first_message
    FROM chat_messages m
    WHERE m.user_id = ?
    GROUP BY session_id
    ORDER BY last_at DESC
    LIMIT 50
  `, [userId, userId])

  return NextResponse.json(sessions)
}

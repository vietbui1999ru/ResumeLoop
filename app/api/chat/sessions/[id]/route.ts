import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { getAdapter } from '@/lib/db-adapter'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = session.user.id

  const { id } = await params
  const db = await getAdapter()
  const messages = await db.query<{ role: string; content: string | null; tool_calls: string | null; created_at: string }>(`
    SELECT role, content, tool_calls, created_at
    FROM chat_messages
    WHERE session_id = ? AND user_id = ? AND role IN ('user', 'assistant')
    ORDER BY created_at ASC
    LIMIT 50
  `, [id, userId])

  return NextResponse.json(messages)
}

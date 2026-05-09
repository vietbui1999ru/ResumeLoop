import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const messages = getDb()
    .prepare(`
      SELECT role, content, tool_calls, created_at
      FROM chat_messages
      WHERE session_id = ? AND role IN ('user', 'assistant')
      ORDER BY created_at ASC
      LIMIT 50
    `)
    .all(id) as Array<{ role: string; content: string | null; tool_calls: string | null; created_at: string }>

  return NextResponse.json(messages)
}

import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export async function GET() {
  const sessions = getDb()
    .prepare(
      `SELECT
        session_id,
        MIN(created_at) as started_at,
        MAX(created_at) as last_at,
        (SELECT content FROM chat_messages m2
         WHERE m2.session_id = m.session_id AND m2.role = 'user'
         ORDER BY created_at ASC LIMIT 1) as first_message
      FROM chat_messages m
      GROUP BY session_id
      ORDER BY last_at DESC
      LIMIT 50`
    )
    .all()

  return NextResponse.json(sessions)
}

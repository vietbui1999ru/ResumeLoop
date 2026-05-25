import { NextResponse } from 'next/server'
import { timingSafeEqual } from 'crypto'
import { getAdapter } from '@/lib/db-adapter'
import { isCloud } from '@/lib/app-mode'
import { deleteUserOutputs } from '@/lib/storage'

function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  return timingSafeEqual(Buffer.from(a), Buffer.from(b))
}

export async function POST(req: Request) {
  const secret = req.headers.get('x-purge-secret') ?? ''
  const expected = process.env.PURGE_SECRET ?? ''
  if (!expected || !safeCompare(secret, expected)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  if (!isCloud()) {
    return NextResponse.json({ error: 'Only available in cloud mode' }, { status: 403 })
  }

  const db = await getAdapter()
  const users = await db.query<{ id: string }>(
    `SELECT id FROM users WHERE deleted_at IS NOT NULL AND deleted_at < NOW() - INTERVAL '15 days'`,
  )

  for (const user of users) {
    // runInTransaction: SQLite uses a real transaction; NeonAdapter uses .transaction()
    // which sends all statements in one HTTP request — fully atomic on both backends.
    await db.runInTransaction([
      { sql: `DELETE FROM outreach_items            WHERE user_id = ?`, params: [user.id] },
      { sql: `DELETE FROM chat_messages             WHERE user_id = ?`, params: [user.id] },
      { sql: `DELETE FROM jd_outputs                WHERE user_id = ?`, params: [user.id] },
      { sql: `DELETE FROM jd_metrics                WHERE user_id = ?`, params: [user.id] },
      { sql: `DELETE FROM jd_jobs                   WHERE user_id = ?`, params: [user.id] },
      { sql: `DELETE FROM resume_sessions           WHERE user_id = ?`, params: [user.id] },
      { sql: `DELETE FROM resume_profiles           WHERE user_id = ?`, params: [user.id] },
      { sql: `DELETE FROM user_settings             WHERE user_id = ?`, params: [user.id] },
      { sql: `DELETE FROM ai_usage_log              WHERE user_id = ?`, params: [user.id] },
      { sql: `DELETE FROM password_reset_tokens     WHERE user_id = ?`, params: [user.id] },
      { sql: `DELETE FROM email_verification_tokens WHERE user_id = ?`, params: [user.id] },
      { sql: `DELETE FROM oauth_accounts            WHERE user_id = ?`, params: [user.id] },
      { sql: `DELETE FROM app_settings              WHERE key LIKE ?`,  params: [`active_ai_provider:${user.id}`] },
      { sql: `DELETE FROM users                     WHERE id      = ?`, params: [user.id] },
    ])
    // S3 cleanup runs outside the DB transaction — a partial S3 failure should not
    // roll back the DB deletion. Errors are logged but do not fail the request.
    await deleteUserOutputs(user.id).catch(err =>
      console.error(`[purge] S3 cleanup failed for user ${user.id}:`, err)
    )
  }

  return NextResponse.json({ purged: users.length })
}

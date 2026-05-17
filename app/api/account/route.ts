import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { changePassword } from '@/lib/account'
import { getAdapter } from '@/lib/db-adapter'
import bcrypt from 'bcryptjs'

// DELETE /api/account — soft-delete; hard purge runs via admin/purge after 15-day grace
export async function DELETE() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.isDemo) return NextResponse.json({ error: 'Demo account cannot be deleted' }, { status: 403 })

  const db = await getAdapter()
  await db.run(`UPDATE users SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?`, [session.user.id])
  return NextResponse.json({ ok: true, message: 'Account scheduled for deletion in 15 days' })
}

// PATCH /api/account — change password
export async function PATCH(req: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.isDemo) return NextResponse.json({ error: 'Demo account is read-only' }, { status: 403 })

  let body: { currentPassword?: string; newPassword?: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const { currentPassword, newPassword } = body
  if (!currentPassword || !newPassword) {
    return NextResponse.json({ error: 'currentPassword and newPassword required' }, { status: 400 })
  }
  if (newPassword.length < 8)   return NextResponse.json({ error: 'Password must be ≥8 characters' }, { status: 400 })
  if (newPassword.length > 128) return NextResponse.json({ error: 'Password too long' }, { status: 400 })

  const db  = await getAdapter()
  const row = await db.queryOne<{ password: string }>(
    `SELECT password FROM users WHERE id = ?`, [session.user.id],
  )
  if (!row?.password) {
    return NextResponse.json({ error: 'No password set (OAuth-only account)' }, { status: 400 })
  }

  const ok = await bcrypt.compare(currentPassword, row.password)
  if (!ok) return NextResponse.json({ error: 'Current password is incorrect' }, { status: 400 })

  await changePassword(session.user.id, newPassword)
  return NextResponse.json({ ok: true })
}

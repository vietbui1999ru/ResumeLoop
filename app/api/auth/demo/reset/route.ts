import { NextResponse }  from 'next/server'
import { auth }          from '@/lib/auth'
import { getAdapter }    from '@/lib/db-adapter'
import { resetDemoUser } from '@/lib/demo-seed'

export async function POST() {
  const session = await auth()
  if (!session?.user?.id)   return NextResponse.json({ error: 'Unauthorized' },       { status: 401 })
  if (!session.user.isDemo) return NextResponse.json({ error: 'Not a demo account' }, { status: 403 })

  const db  = await getAdapter()
  const row = await db.queryOne<{ ip_hash: string }>(
    `SELECT ip_hash FROM users WHERE id = ?`,
    [session.user.id],
  )
  if (!row?.ip_hash) return NextResponse.json({ error: 'Demo user not found' }, { status: 404 })

  try {
    const { email, password } = await resetDemoUser(session.user.id, row.ip_hash)
    return NextResponse.json({ email, password })
  } catch (e) {
    console.error('[demo/reset] Failed to reset demo session:', e)
    return NextResponse.json({ error: 'Failed to reset demo session' }, { status: 500 })
  }
}

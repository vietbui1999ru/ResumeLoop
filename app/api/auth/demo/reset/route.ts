import { NextResponse }              from 'next/server'
import { auth }                      from '@/lib/auth'
import { getAdapter }                from '@/lib/db-adapter'
import { resetDemoUser }             from '@/lib/demo-seed'
import { checkRateLimitAsync, extractIp } from '@/lib/rate-limit'

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user?.id)   return NextResponse.json({ error: 'Unauthorized' },       { status: 401 })
  if (!session.user.isDemo) return NextResponse.json({ error: 'Not a demo account' }, { status: 403 })

  // Rate limit resets by IP — prevents bypassing the generation cap by resetting repeatedly
  const ip = extractIp(request)
  const rl = await checkRateLimitAsync(`demo:reset:${ip}`, 3, 3_600_000)  // 3 resets per hour per IP
  if (!rl.success) return NextResponse.json({ error: 'Too many resets — try again later' }, { status: 429 })

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

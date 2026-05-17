import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { getAdapter } from '@/lib/db-adapter'
import { sendPasswordResetEmail } from '@/lib/email'
import { checkRateLimitAsync } from '@/lib/rate-limit'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function POST(req: Request) {
  const ip = (await headers()).get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  const rl = await checkRateLimitAsync(`auth:forgot:${ip}`, 5, 60_000)
  if (!rl.success) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }

  let body: { email?: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const email = body.email?.trim().toLowerCase() ?? ''
  if (!EMAIL_RE.test(email)) return NextResponse.json({ error: 'Invalid email' }, { status: 400 })

  const rlEmail = await checkRateLimitAsync(`auth:forgot:email:${email}`, 3, 3_600_000)
  if (!rlEmail.success) {
    return NextResponse.json({ ok: true }) // silent — don't reveal whether email exists
  }

  const db  = await getAdapter()
  const row = await db.queryOne<{ id: string }>(
    `SELECT id FROM users WHERE email = ?`, [email],
  )

  // Always return ok to prevent email enumeration
  if (row) {
    await sendPasswordResetEmail(row.id, email).catch(() => { /* non-fatal */ })
  }

  return NextResponse.json({ ok: true })
}

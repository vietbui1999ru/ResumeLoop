import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { consumePasswordResetToken } from '@/lib/email'
import { changePassword } from '@/lib/account'
import { checkRateLimitAsync } from '@/lib/rate-limit'

export async function POST(req: Request) {
  const ip = (await headers()).get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  const rl = await checkRateLimitAsync(`auth:reset:${ip}`, 10, 60_000)
  if (!rl.success) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

  let body: { token?: string; password?: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const { token, password } = body
  if (!token || !password)     return NextResponse.json({ error: 'token and password required' }, { status: 400 })
  if (password.length < 8)     return NextResponse.json({ error: 'Password must be ≥8 characters' }, { status: 400 })
  if (password.length > 128)   return NextResponse.json({ error: 'Password too long' }, { status: 400 })

  const userId = await consumePasswordResetToken(token)
  if (!userId) return NextResponse.json({ error: 'Invalid or expired token' }, { status: 400 })

  await changePassword(userId, password)
  return NextResponse.json({ ok: true })
}

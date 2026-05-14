import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { createUser } from '@/lib/account'
import { sendVerificationEmail } from '@/lib/email'
import { checkRateLimitAsync } from '@/lib/rate-limit'
import { isCloud } from '@/lib/app-mode'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function POST(req: Request) {
  const ip = (await headers()).get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  const rl = await checkRateLimitAsync(`auth:signup:${ip}`, 5, 60_000)
  if (!rl.success) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }

  let body: { email?: string; password?: string }
  try {
    body = await req.json() as { email?: string; password?: string }
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const email    = body.email?.trim().toLowerCase() ?? ''
  const password = body.password ?? ''

  if (!EMAIL_RE.test(email))    return NextResponse.json({ error: 'Invalid email' },                { status: 400 })
  if (password.length < 8)      return NextResponse.json({ error: 'Password must be ≥8 characters' }, { status: 400 })
  if (password.length > 128)    return NextResponse.json({ error: 'Password too long' },            { status: 400 })
  if (email === 'demo@demo.com') return NextResponse.json({ error: 'That email is reserved' },      { status: 400 })

  try {
    const userId = await createUser(email, password)
    if (isCloud()) {
      await sendVerificationEmail(userId, email).catch(() => { /* non-fatal */ })
    }
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Email already registered' }, { status: 409 })
  }
}

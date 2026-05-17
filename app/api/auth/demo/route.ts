import { NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import bcrypt from 'bcryptjs'
import { getAdapter } from '@/lib/db-adapter'
import { seedDemoUser } from '@/lib/demo-seed'
import { checkRateLimitAsync } from '@/lib/rate-limit'
import { headers } from 'next/headers'

export async function POST() {
  const ip = (await headers()).get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  const rl = await checkRateLimitAsync(`auth:demo:${ip}`, 10, 60_000)
  if (!rl.success) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }

  const id       = randomUUID()
  const email    = `demo_${id}@demo.local`
  const password = randomUUID()
  const hash     = await bcrypt.hash(password, 10)

  try {
    const db = await getAdapter()
    await db.run(
      `INSERT INTO users (id, email, password, is_demo, email_verified) VALUES (?, ?, ?, 1, 1)`,
      [id, email, hash],
    )
    await seedDemoUser(id)
  } catch (e) {
    console.error('[demo] Failed to create demo session:', e)
    return NextResponse.json({ error: 'Failed to create demo session' }, { status: 500 })
  }

  return NextResponse.json({ email, password })
}

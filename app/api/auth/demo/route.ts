import { NextResponse }             from 'next/server'
import { createHash }               from 'crypto'
import { getOrCreateDemoUserForIp } from '@/lib/demo-seed'
import { checkRateLimitAsync }      from '@/lib/rate-limit'
import { createDemoToken }          from '@/lib/demo-token-store'
import { headers }                  from 'next/headers'

export async function POST() {
  const ip = (await headers()).get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  const rl = await checkRateLimitAsync(`auth:demo:${ip}`, 30, 60_000)
  if (!rl.success) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }

  const ipHash = createHash('sha256').update(ip).digest('hex')
  try {
    const { email, password } = await getOrCreateDemoUserForIp(ipHash)
    const token = createDemoToken(email, password)
    return NextResponse.json({ token })
  } catch (e) {
    console.error('[demo] Failed to create demo session:', e)
    return NextResponse.json({ error: 'Failed to create demo session' }, { status: 500 })
  }
}

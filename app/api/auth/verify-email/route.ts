import { NextResponse } from 'next/server'
import { consumeVerificationToken } from '@/lib/email'

export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get('token') ?? ''
  if (!token) return NextResponse.json({ error: 'token required' }, { status: 400 })

  const userId = await consumeVerificationToken(token)
  if (!userId) return NextResponse.json({ error: 'Invalid or expired token' }, { status: 400 })

  return new NextResponse(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer',
    },
  })
}

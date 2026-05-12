import { NextResponse } from 'next/server'
import { version } from '@/package.json'

export async function GET() {
  return NextResponse.json({ ok: true, version, ts: Date.now() })
}

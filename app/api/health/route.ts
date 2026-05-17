import { NextResponse } from 'next/server'
import { version } from '@/package.json'
import { getDb } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  const checks: Record<string, 'ok' | 'error'> = {}

  try {
    getDb().prepare('SELECT 1').get()
    checks.db = 'ok'
  } catch {
    checks.db = 'error'
  }

  const allOk = Object.values(checks).every(v => v === 'ok')

  return NextResponse.json(
    {
      status: allOk ? 'ok' : 'degraded',
      version,
      env: process.env.NODE_ENV ?? 'unknown',
      uptime: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
      checks,
    },
    {
      status: allOk ? 200 : 503,
      headers: { 'Cache-Control': 'no-store' },
    }
  )
}

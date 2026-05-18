import { NextResponse } from 'next/server'
import { version } from '@/package.json'
import { isCloud } from '@/lib/app-mode'
import { getAdapter } from '@/lib/db-adapter'
import { getDb } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  const checks: Record<string, 'ok' | 'error'> = {}

  try {
    if (isCloud()) {
      const db = await getAdapter()
      await db.query('SELECT 1')
    } else {
      getDb().prepare('SELECT 1').get()
    }
    checks.db = 'ok'
  } catch (e) {
    console.error('[health] db check failed:', e)
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

import { NextResponse }               from 'next/server'
import { checkLogsAuth }              from '@/lib/logs-auth'
import { cleanupExpiredDemoUsers }    from '@/lib/demo-seed'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  if (!await checkLogsAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { purged } = await cleanupExpiredDemoUsers()
  return NextResponse.json({ purged, timestamp: new Date().toISOString() })
}

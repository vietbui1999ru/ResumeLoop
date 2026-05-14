import { NextResponse } from 'next/server'
import { checkLogsAuth } from '@/lib/logs-auth'
import { listSummaries, listFull, purgeAll } from '@/lib/logs-service'
import { checkRateLimit, extractIp } from '@/lib/rate-limit'

export async function GET(req: Request) {
  if (!await checkLogsAuth(req)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const url    = new URL(req.url)
  const full   = url.searchParams.get('full') === 'true'
  const raw    = parseInt(url.searchParams.get('limit') ?? '50', 10)
  const limit  = Math.max(1, Math.min(200, isNaN(raw) ? 50 : raw))
  const jobId  = url.searchParams.get('jobId') ?? undefined

  if (full) {
    return NextResponse.json(listFull({ limit, jobId }))
  }
  return NextResponse.json(listSummaries({ limit, jobId }))
}

export async function DELETE(req: Request) {
  if (!await checkLogsAuth(req)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  if (!checkRateLimit(extractIp(req))) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }

  const deleted = purgeAll()
  return NextResponse.json({ ok: true, deleted })
}

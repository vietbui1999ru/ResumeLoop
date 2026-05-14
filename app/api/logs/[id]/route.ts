import { NextResponse } from 'next/server'
import { checkLogsAuth } from '@/lib/logs-auth'
import { getLog, deleteLog } from '@/lib/logs-service'
import { checkRateLimit, extractIp } from '@/lib/rate-limit'

type Ctx = { params: Promise<{ id: string }> }

export async function GET(req: Request, { params }: Ctx) {
  if (!await checkLogsAuth(req)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const { id } = await params
  const log = getLog(id)
  if (!log) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(log)
}

export async function DELETE(req: Request, { params }: Ctx) {
  if (!await checkLogsAuth(req)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  if (!checkRateLimit(extractIp(req))) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }
  const { id } = await params
  const ok = deleteLog(id)
  if (!ok) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ ok: true })
}

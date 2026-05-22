import { NextResponse } from 'next/server'
import { auth }         from '@/lib/auth'
import { createIngestionSource, updateIngestionSource } from '@/lib/ingest/db'
import { extractFromPaste } from '@/lib/ingest/extract-paste'

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = session.user.id

  const body = await req.json() as { text?: string }
  if (!body.text?.trim()) return NextResponse.json({ error: 'text required' }, { status: 400 })

  const source = await createIngestionSource(userId, 'paste', body.text)

  try {
    await updateIngestionSource(source.id, userId, { status: 'processing' })
    const partial = await extractFromPaste(body.text, userId, null)
    await updateIngestionSource(source.id, userId, { status: 'done', extractedPartial: partial })
    return NextResponse.json({ source: { ...source, status: 'done', extractedPartial: partial } })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    await updateIngestionSource(source.id, userId, { status: 'failed', errorMsg: msg })
    return NextResponse.json({ error: msg }, { status: 422 })
  }
}

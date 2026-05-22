import { NextResponse }   from 'next/server'
import { auth }           from '@/lib/auth'
import { createIngestionSource, updateIngestionSource } from '@/lib/ingest/db'
import { extractFromUrl } from '@/lib/ingest/extract-url'

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = session.user.id

  const body = await req.json() as { url?: string }
  if (!body.url?.trim()) return NextResponse.json({ error: 'url required' }, { status: 400 })

  let validUrl: string
  try { validUrl = new URL(body.url).toString() }
  catch { return NextResponse.json({ error: 'Invalid URL' }, { status: 400 }) }

  const source = await createIngestionSource(userId, 'url', validUrl)

  try {
    await updateIngestionSource(source.id, userId, { status: 'processing' })
    const partial = await extractFromUrl(validUrl, userId)
    await updateIngestionSource(source.id, userId, { status: 'done', extractedPartial: partial })
    return NextResponse.json({ source: { ...source, status: 'done', extractedPartial: partial } })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    await updateIngestionSource(source.id, userId, { status: 'failed', errorMsg: msg })
    return NextResponse.json({ error: msg }, { status: 422 })
  }
}

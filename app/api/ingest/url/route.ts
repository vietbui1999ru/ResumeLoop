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
  try {
    const parsed = new URL(body.url)
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return NextResponse.json({ error: 'Only http:// and https:// URLs are allowed' }, { status: 400 })
    }
    const h = parsed.hostname.toLowerCase()
    const blocked = ['localhost', '127.0.0.1', '0.0.0.0', '::1', '169.254.169.254', '169.254.170.2', 'metadata.google.internal']
    if (blocked.includes(h) || /^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.)/.test(h)) {
      return NextResponse.json({ error: 'URL points to a disallowed host' }, { status: 400 })
    }
    validUrl = parsed.toString()
  } catch {
    return NextResponse.json({ error: 'Invalid URL' }, { status: 400 })
  }

  const source = await createIngestionSource(userId, 'url', validUrl)

  try {
    await updateIngestionSource(source.id, userId, { status: 'processing' })
    const partial = await extractFromUrl(validUrl, userId)
    await updateIngestionSource(source.id, userId, { status: 'done', extractedPartial: partial })
    return NextResponse.json({ source: { ...source, status: 'done', extractedPartial: partial } })
  } catch (e) {
    const raw = e instanceof Error ? e.message : String(e)
    const userMsg = /api.?key|x-api-key|authentication|unauthorized|401/i.test(raw)
      ? 'Extraction failed — check your AI model key in Settings'
      : /fetch|ECONNREFUSED|timeout|network/i.test(raw)
        ? 'Failed to reach the URL — check it and try again'
        : raw.slice(0, 200)
    await updateIngestionSource(source.id, userId, { status: 'failed', errorMsg: userMsg })
    return NextResponse.json({ error: userMsg }, { status: 422 })
  }
}

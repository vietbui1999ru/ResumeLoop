import { NextResponse }  from 'next/server'
import { auth }          from '@/lib/auth'
import { createIngestionSource, updateIngestionSource } from '@/lib/ingest/db'
import { extractFromGithub, parseGithubInput } from '@/lib/ingest/extract-github'

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = session.user.id

  const body = await req.json() as { input?: string }
  if (!body.input?.trim()) return NextResponse.json({ error: 'input required' }, { status: 400 })

  try {
    parseGithubInput(body.input)  // validate before creating DB row
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 400 })
  }

  const source = await createIngestionSource(userId, 'github', body.input)

  try {
    await updateIngestionSource(source.id, userId, { status: 'processing' })
    const partial = await extractFromGithub(body.input, userId)
    await updateIngestionSource(source.id, userId, { status: 'done', extractedPartial: partial })
    return NextResponse.json({ source: { ...source, status: 'done', extractedPartial: partial } })
  } catch (e) {
    const raw = e instanceof Error ? e.message : String(e)
    const userMsg = /api.?key|x-api-key|authentication|unauthorized|401/i.test(raw)
      ? 'Extraction failed — check your AI model key in Settings'
      : raw.slice(0, 200)
    await updateIngestionSource(source.id, userId, { status: 'failed', errorMsg: userMsg })
    return NextResponse.json({ error: userMsg }, { status: 422 })
  }
}

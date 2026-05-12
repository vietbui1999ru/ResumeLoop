import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { getAdapter } from '@/lib/db-adapter'
import { listOutreachItems, streamBrief } from '@/lib/outreach'

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = session.user.id
  const { id: jobId } = await params

  const db = await getAdapter()
  const job = await db.queryOne<{ company: string; role_title: string; raw_content: string }>(
    'SELECT company, role_title, raw_content FROM jd_jobs WHERE id = ? AND user_id = ?',
    [jobId, userId],
  )
  if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 })

  const items = await listOutreachItems(jobId, userId)
  if (items.length === 0) return NextResponse.json({ error: 'No sources ingested yet' }, { status: 400 })

  let streamResult: Awaited<ReturnType<typeof streamBrief>>
  try {
    streamResult = await streamBrief(
      items,
      { company: job.company ?? '', role_title: job.role_title ?? '', raw_content: job.raw_content ?? '' },
      userId,
    )
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: 'Brief generation failed', detail: msg }, { status: 502 })
  }

  const encoder = new TextEncoder()
  let fullText = ''

  const readable = new ReadableStream({
    async start(controller) {
      for await (const chunk of streamResult.textStream) {
        fullText += chunk
        controller.enqueue(encoder.encode(chunk))
      }
      controller.close()

      try {
        await db.run(
          'UPDATE jd_jobs SET outreach_brief = ? WHERE id = ? AND user_id = ?',
          [fullText, jobId, userId],
        )
      } catch { /* non-fatal */ }
    },
  })

  return new Response(readable, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  })
}

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { getAdapter } from '@/lib/db-adapter'
import { streamCoverLetter } from '@/lib/cover-letter'

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

  const output = await db.queryOne<{
    id: string
    tagline: string | null
    variant: string | null
    projects_used: string | null
    work_ids_used: string | null
    reasoning: string | null
  }>(
    'SELECT id, tagline, variant, projects_used, work_ids_used, reasoning FROM jd_outputs WHERE job_id = ? AND user_id = ? ORDER BY built_at DESC LIMIT 1',
    [jobId, userId],
  )

  let streamResult: Awaited<ReturnType<typeof streamCoverLetter>>
  try {
    streamResult = await streamCoverLetter({
      company: job.company,
      roleTitle: job.role_title,
      rawContent: job.raw_content,
      tagline: output?.tagline ?? null,
      variant: output?.variant ?? null,
      projectsUsed: output?.projects_used ?? null,
      workIdsUsed: output?.work_ids_used ?? null,
      reasoning: output?.reasoning ?? null,
    }, userId)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: 'Cover letter generation failed', detail: msg }, { status: 502 })
  }

  // Stream to client while collecting full text to persist in DB
  const encoder = new TextEncoder()
  let fullText = ''

  const readable = new ReadableStream({
    async start(controller) {
      for await (const chunk of streamResult.textStream) {
        fullText += chunk
        controller.enqueue(encoder.encode(chunk))
      }
      controller.close()

      if (output?.id) {
        try {
          await db.run(
            'UPDATE jd_outputs SET cover_letter = ? WHERE id = ? AND user_id = ?',
            [fullText, output.id, userId],
          )
        } catch { /* non-fatal */ }
      }
    },
  })

  return new Response(readable, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  })
}

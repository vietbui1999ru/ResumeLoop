import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { getAdapter } from '@/lib/db-adapter'
import { listOutreachItems } from '@/lib/outreach'
import { streamApplicationCase } from '@/lib/application-case'

type Ctx = { params: Promise<{ id: string }> }

export async function GET(_req: Request, { params }: Ctx) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = session.user.id
  const { id: jobId } = await params

  const db = await getAdapter()
  const row = await db.queryOne<{ application_case: string | null }>(
    'SELECT application_case FROM jd_jobs WHERE id = ? AND user_id = ?',
    [jobId, userId],
  )
  if (!row) return NextResponse.json({ error: 'Job not found' }, { status: 404 })
  return NextResponse.json({ case: row.application_case ?? null })
}

export async function POST(_req: Request, { params }: Ctx) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = session.user.id
  const { id: jobId } = await params

  const db = await getAdapter()
  const job = await db.queryOne<{
    company: string
    role_title: string
    raw_content: string
    outreach_brief: string | null
  }>(
    'SELECT company, role_title, raw_content, outreach_brief FROM jd_jobs WHERE id = ? AND user_id = ?',
    [jobId, userId],
  )
  if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 })

  const output = await db.queryOne<{ reasoning: string | null }>(
    'SELECT reasoning FROM jd_outputs WHERE job_id = ? AND user_id = ? ORDER BY built_at DESC LIMIT 1',
    [jobId, userId],
  )

  const contacts = await listOutreachItems(jobId, userId)

  let streamResult: Awaited<ReturnType<typeof streamApplicationCase>>
  try {
    streamResult = await streamApplicationCase(
      {
        job: {
          company:       job.company ?? '',
          role_title:    job.role_title ?? '',
          raw_content:   job.raw_content ?? '',
          outreach_brief: job.outreach_brief ?? null,
        },
        reasoning: output?.reasoning ?? null,
        contacts,
      },
      userId,
    )
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: 'Case generation failed', detail: msg }, { status: 502 })
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
          'UPDATE jd_jobs SET application_case = ? WHERE id = ? AND user_id = ?',
          [fullText, jobId, userId],
        )
      } catch { /* non-fatal */ }
    },
  })

  return new Response(readable, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  })
}

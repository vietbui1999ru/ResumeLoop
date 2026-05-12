import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { getAdapter } from '@/lib/db-adapter'
import { getOutreachItem, updateOutreachItem, generateDrafts } from '@/lib/outreach'

type Params = { params: Promise<{ id: string; itemId: string }> }

export async function POST(_req: Request, { params }: Params) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = session.user.id
  const { id: jobId, itemId } = await params

  const item = await getOutreachItem(itemId, jobId, userId)
  if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const db = await getAdapter()
  const job = await db.queryOne<{ company: string; role_title: string; outreach_brief: string | null }>(
    'SELECT company, role_title, outreach_brief FROM jd_jobs WHERE id = ? AND user_id = ?',
    [jobId, userId],
  )
  if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 })

  const output = await db.queryOne<{ tagline: string | null; variant: string | null; reasoning: string | null }>(
    'SELECT tagline, variant, reasoning FROM jd_outputs WHERE job_id = ? AND user_id = ? ORDER BY built_at DESC LIMIT 1',
    [jobId, userId],
  )

  const jobContext = { company: job.company ?? '', role_title: job.role_title ?? '' }
  const resumeCtx = output
    ? { tagline: output.tagline, variant: output.variant, reasoning: output.reasoning }
    : null

  let drafts: { linkedin_draft: string; email_draft: string }
  try {
    drafts = await generateDrafts(item, job.outreach_brief ?? null, resumeCtx, jobContext, userId)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: 'Draft generation failed', detail: msg }, { status: 502 })
  }

  await updateOutreachItem(itemId, jobId, userId, {
    linkedin_draft: drafts.linkedin_draft,
    email_draft:    drafts.email_draft,
    status:         'drafted',
  })

  return NextResponse.json(drafts)
}

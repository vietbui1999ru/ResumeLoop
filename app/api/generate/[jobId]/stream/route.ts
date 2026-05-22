import { NextResponse } from 'next/server'
import { runPipeline } from '@/lib/generate-pipeline'
import { auth } from '@/lib/auth'
import { getActiveProvider } from '@/lib/user-settings'
import { getAdapter } from '@/lib/db-adapter'

export const dynamic = 'force-dynamic'

const DEMO_GENERATE_LIMIT = 10

const inFlight = new Map<string, Set<string>>() // userId → Set of jobIds

export async function GET(
  request: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = session.user.id

  const { jobId } = await params
  const sessionId = new URL(request.url).searchParams.get('sessionId') ?? 'default'

  // Ownership check first — prevents probing whether a jobId exists via provider-error timing
  const db = await getAdapter()
  const jobExists = await db.queryOne<{ id: string }>(
    'SELECT id FROM jd_jobs WHERE id = ? AND user_id = ?',
    [jobId, userId],
  )
  if (!jobExists) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const provider = await getActiveProvider(userId)
  if (!provider) {
    return NextResponse.json(
      { error: 'No AI provider configured. Add an API key in Settings → AI Provider before generating.' },
      { status: 400 }
    )
  }

  if (session.user.isDemo) {
    const db  = await getAdapter()
    const row = await db.queryOne<{ n: number }>(
      `SELECT COUNT(*) as n FROM jd_outputs WHERE user_id = ?`,
      [userId],
    )
    if ((row?.n ?? 0) >= DEMO_GENERATE_LIMIT) {
      return NextResponse.json(
        { error: `Demo accounts are limited to ${DEMO_GENERATE_LIMIT} generations. Sign up for unlimited access.` },
        { status: 429 },
      )
    }
  }

  const userJobs = inFlight.get(userId) ?? new Set<string>()
  if (userJobs.size >= 3) {
    return new Response('Too many concurrent generations', { status: 429 })
  }
  userJobs.add(jobId)
  inFlight.set(userId, userJobs)

  const stream = new ReadableStream({
    async start(controller) {
      const encode = (event: object) =>
        new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`)
      try {
        for await (const event of runPipeline(jobId, sessionId, userId, request.signal)) {
          controller.enqueue(encode(event))
        }
      } catch (err) {
        // Strip internal paths from error messages before sending to client
        const raw = err instanceof Error ? err.message : String(err)
        const safe = raw.replace(/\/[^\s"']+/g, '[path]')
        controller.enqueue(encode({
          stage: 'error', status: 'fail', data: { message: safe }
        }))
      } finally {
        inFlight.get(userId)?.delete(jobId)
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type':  'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection':    'keep-alive',
    },
  })
}

import { NextResponse } from 'next/server'
import { runPipeline } from '@/lib/generate-pipeline'
import { auth } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = session.user.id

  const { jobId } = await params
  const sessionId = new URL(request.url).searchParams.get('sessionId') ?? 'default'

  const stream = new ReadableStream({
    async start(controller) {
      const encode = (event: object) =>
        new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`)
      try {
        for await (const event of runPipeline(jobId, sessionId, userId)) {
          controller.enqueue(encode(event))
        }
      } catch (err) {
        controller.enqueue(encode({
          stage: 'error', status: 'fail', data: { message: String(err) }
        }))
      } finally {
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

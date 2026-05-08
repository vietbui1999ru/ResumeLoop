import { runPipeline } from '@/lib/generate-pipeline'

export const dynamic = 'force-dynamic'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params

  const stream = new ReadableStream({
    async start(controller) {
      const encode = (event: object) =>
        new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`)
      try {
        for await (const event of runPipeline(jobId)) {
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

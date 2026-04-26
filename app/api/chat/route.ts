import { getLlmClient } from '@/lib/llm-client'
import { buildSystemPrompt, buildSlashContext } from '@/lib/context-builder'

export const dynamic = 'force-dynamic'

type Msg = { role: 'user' | 'assistant' | 'system'; content: string }

export async function POST(req: Request) {
  const { messages }: { messages: Msg[] } = await req.json()
  if (!messages?.length) return new Response('messages required', { status: 400 })

  const last = messages[messages.length - 1]
  let extra = ''
  const slash = last.content.match(/^\/(\w+)(?:\s+(.*))?$/)
  if (slash) extra = buildSlashContext(slash[1], slash[2] ?? '')

  const system = buildSystemPrompt()
  const fullSystem = extra ? `${system}\n\n## Query Context\n${extra}` : system

  const client = getLlmClient()
  const response = await client.chat.completions.create({
    model: 'local',
    messages: [{ role: 'system', content: fullSystem }, ...messages],
    stream: true,
  })

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      for await (const chunk of response) {
        const text = chunk.choices[0]?.delta?.content ?? ''
        if (text) controller.enqueue(encoder.encode(text))
      }
      controller.close()
    },
  })

  return new Response(stream, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
}

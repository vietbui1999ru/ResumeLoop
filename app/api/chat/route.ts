import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { getDb } from '@/lib/db'
import { CHAT_TOOLS, handleReadFile, handleProposeEdit, type FileKey } from '@/lib/chat-tools'

const SYSTEM_PROMPT = `You are a resume profile editor for Quoc-Viet Bui.

Files you can read and edit:
- master_resume_data: work experience bullets, projects, skills variants (JSON)
- claude_full: full resume rules and constraints
- ats_guidelines: ATS optimization guidelines
- ats_system: ATS system prompt context
- spec: CLAUDE.md condensed rules

Rules:
- Always call read_file before propose_edit on any file.
- Propose only one edit per response turn.
- Tagline must be ≤76 chars. Bullets must be ≤116 chars.
- Bullet formula: "Built A doing B using C, which produced D" — tech + result required.
- master_resume_data.json must remain valid JSON at all times.`

function buildMessages(
  rows: Array<{ role: string; content: string | null; tool_calls: string | null }>
): Anthropic.MessageParam[] {
  return rows.map(r => {
    if (r.role === 'user') return { role: 'user' as const, content: r.content ?? '' }
    if (r.role === 'tool') {
      const calls = JSON.parse(r.tool_calls ?? '[]') as Array<{ id: string; result: string }>
      return {
        role: 'user' as const,
        content: calls.map(c => ({
          type: 'tool_result' as const,
          tool_use_id: c.id,
          content: c.result,
        })),
      }
    }
    // assistant
    const toolCalls = r.tool_calls ? JSON.parse(r.tool_calls) as Anthropic.ToolUseBlock[] : []
    const textParts: Anthropic.MessageParam['content'] = r.content
      ? [{ type: 'text' as const, text: r.content }]
      : []
    const allParts = [...textParts, ...toolCalls] as Anthropic.MessageParam['content']
    return { role: 'assistant' as const, content: allParts }
  })
}

type ToolBlockWithRaw = Anthropic.ToolUseBlock & { _raw?: string }

async function runStream(
  client: Anthropic,
  messages: Anthropic.MessageParam[],
  send: (obj: Record<string, unknown>) => void,
  sessionId: string,
): Promise<{ assistantText: string; toolBlocks: ToolBlockWithRaw[]; toolResults: Array<{ id: string; result: string }> }> {
  let assistantText = ''
  const toolBlocks: ToolBlockWithRaw[] = []
  const toolResults: Array<{ id: string; result: string }> = []

  const apiStream = client.messages.stream({
    model: 'claude-opus-4-7',
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    tools: CHAT_TOOLS,
    messages,
  })

  for await (const event of apiStream) {
    if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
      assistantText += event.delta.text
      send({ type: 'text', delta: event.delta.text })
    }

    if (event.type === 'content_block_start' && event.content_block.type === 'tool_use') {
      toolBlocks.push({ ...event.content_block, input: {}, _raw: '' } as ToolBlockWithRaw)
    }

    if (event.type === 'content_block_delta' && event.delta.type === 'input_json_delta') {
      const last = toolBlocks[toolBlocks.length - 1]
      if (last) last._raw = (last._raw ?? '') + event.delta.partial_json
    }

    if (event.type === 'message_stop') {
      for (const block of toolBlocks) {
        try {
          block.input = JSON.parse(block._raw ?? '{}')
        } catch {
          block.input = {}
        }

        let toolResult = ''

        if (block.name === 'read_file') {
          const { file } = block.input as { file: FileKey }
          toolResult = await handleReadFile(file)
        } else if (block.name === 'propose_edit') {
          const { file, description, new_content } = block.input as {
            file: FileKey
            description: string
            new_content: string
          }
          const result = await handleProposeEdit(file, description, new_content)
          if (result.error) {
            toolResult = `Error: ${result.error}`
          } else {
            const pendingKey = `pending_edit:${sessionId}`
            getDb()
              .prepare(
                'INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
              )
              .run(pendingKey, JSON.stringify({ file, description, new_content }))
            send({ type: 'diff', file, description, diff: result.diff })
            toolResult = 'Edit proposed — pending user approval'
          }
        }

        toolResults.push({ id: block.id, result: toolResult })
      }
    }
  }

  return { assistantText, toolBlocks, toolResults }
}

function loadHistory(db: ReturnType<typeof getDb>, sessionId: string) {
  return db
    .prepare(
      'SELECT role, content, tool_calls FROM chat_messages WHERE session_id = ? ORDER BY created_at ASC'
    )
    .all(sessionId) as Array<{ role: string; content: string | null; tool_calls: string | null }>
}

export async function POST(req: Request) {
  const { sessionId, message } = (await req.json()) as { sessionId: string; message: string }
  if (!sessionId || !message)
    return NextResponse.json({ error: 'sessionId and message required' }, { status: 400 })

  const db = getDb()
  const msgId = crypto.randomUUID()
  db.prepare('INSERT INTO chat_messages (id, session_id, role, content) VALUES (?, ?, ?, ?)').run(
    msgId,
    sessionId,
    'user',
    message
  )

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: Record<string, unknown>) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`))

      try {
        const client = new Anthropic()
        const MAX_TURNS = 8
        let loopCount = 0

        while (loopCount < MAX_TURNS) {
          loopCount++

          const history = loadHistory(db, sessionId)
          const messages = buildMessages(history)

          const { assistantText, toolBlocks, toolResults } = await runStream(
            client,
            messages,
            send,
            sessionId
          )

          // Save assistant turn
          const assistantId = crypto.randomUUID()
          const cleanBlocks = toolBlocks.map(({ _raw: _, ...rest }) => rest)
          db.prepare(
            'INSERT INTO chat_messages (id, session_id, role, content, tool_calls) VALUES (?, ?, ?, ?, ?)'
          ).run(
            assistantId,
            sessionId,
            'assistant',
            assistantText || null,
            cleanBlocks.length ? JSON.stringify(cleanBlocks) : null
          )

          // No tool calls — conversation complete
          if (toolResults.length === 0) break

          // Save tool results so next turn sees them
          const toolMsgId = crypto.randomUUID()
          db.prepare(
            'INSERT INTO chat_messages (id, session_id, role, content, tool_calls) VALUES (?, ?, ?, ?, ?)'
          ).run(toolMsgId, sessionId, 'tool', null, JSON.stringify(toolResults))
        }

        send({ type: 'done' })
      } catch (e) {
        send({ type: 'error', message: String(e) })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}

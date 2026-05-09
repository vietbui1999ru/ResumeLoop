# Chat Profile Editor Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A `/chat` page where the user converses with Claude to revise `master_resume_data.json` and reference docs. Claude reads files via tools and proposes full-file diffs that the user must Accept before anything is written.

**Architecture:** New `chat_messages` SQLite table for session history; `lib/chat-tools.ts` handles `read_file` and `propose_edit` tool calls server-side; `POST /api/chat` streams SSE events including `{ type: 'diff' }` for proposed edits; `POST /api/chat/apply` writes the file on Accept; `components/ChatDiff.tsx` renders the diff with Accept/Reject buttons; `app/chat/page.tsx` renders sidebar + message list.

**Tech Stack:** TypeScript, Next.js 14 App Router, Anthropic SDK (streaming + tool use), better-sqlite3, `diff` npm package, React, Tailwind

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `lib/db.ts` | Modify | Add `chat_messages` table + index |
| `package.json` | Modify | Add `diff` dependency |
| `lib/chat-tools.ts` | **Create** | `read_file` + `propose_edit` tool definitions and handlers |
| `app/api/chat/route.ts` | **Create** | SSE stream: loads history, streams Claude, handles tool calls |
| `app/api/chat/apply/route.ts` | **Create** | POST: applies or rejects a pending edit |
| `app/api/chat/sessions/route.ts` | **Create** | GET: list sessions for sidebar |
| `components/ChatDiff.tsx` | **Create** | Renders unified diff with Accept/Reject buttons |
| `app/chat/page.tsx` | **Create** | Chat page with sidebar + message list + input |
| `lib/db.test.ts` | Modify | Test `chat_messages` table migration |
| `lib/chat-tools.test.ts` | **Create** | Unit tests for read_file and propose_edit handlers |

---

### Task 1: DB migration — `chat_messages` table

**Files:**
- Modify: `lib/db.test.ts`
- Modify: `lib/db.ts`

- [ ] **Step 1: Write the failing test**

Add to `lib/db.test.ts`:
```typescript
describe('chat_messages table', () => {
  it('creates chat_messages with required columns', () => {
    const db = new Database(':memory:')
    initSchema(db)
    const cols = db.prepare('PRAGMA table_info(chat_messages)').all() as Array<{ name: string }>
    const names = cols.map(c => c.name)
    expect(names).toContain('id')
    expect(names).toContain('session_id')
    expect(names).toContain('role')
    expect(names).toContain('content')
    expect(names).toContain('tool_calls')
    db.close()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run lib/db.test.ts
```
Expected: FAIL — table `chat_messages` does not exist.

- [ ] **Step 3: Add table to `lib/db.ts`**

Inside the `db.exec()` call in `initSchema`, append after `app_settings` table:
```sql
    CREATE TABLE IF NOT EXISTS chat_messages (
      id         TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      role       TEXT NOT NULL,
      content    TEXT,
      tool_calls TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_chat_session ON chat_messages(session_id, created_at);
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run lib/db.test.ts
```
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/db.ts lib/db.test.ts
git commit -m "feat: add chat_messages table to schema"
```

---

### Task 2: Install `diff` dependency

- [ ] **Step 1: Install**

```bash
npm install diff && npm install --save-dev @types/diff
```

- [ ] **Step 2: Verify**

```bash
node -e "const diff = require('diff'); console.log(typeof diff.createPatch)"
```
Expected: `function`.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add diff package for chat diff rendering"
```

---

### Task 3: `lib/chat-tools.ts` — tool definitions and handlers

**Files:**
- Create: `lib/chat-tools.test.ts`
- Create: `lib/chat-tools.ts`

The file map for `read_file`:
```typescript
const FILE_MAP: Record<string, string> = {
  master_resume_data: path.join(ROOT, 'pipeline', 'master_resume_data.json'),
  claude_full:        path.join(ROOT, 'docs', 'reference', 'CLAUDE-full.md'),
  ats_guidelines:     path.join(ROOT, 'docs', 'reference', 'ats-guidelines.md'),
  ats_system:         path.join(ROOT, 'docs', 'reference', 'ats-system-prompt.md'),
  spec:               path.join(ROOT, 'CLAUDE.md'),
}
```

> Replace paths for `ats_guidelines` and `ats_system` with the actual file locations in your `docs/reference/` directory. Check with `ls docs/reference/` before implementing.

- [ ] **Step 1: Write failing tests**

Create `lib/chat-tools.test.ts`:
```typescript
import { describe, it, expect } from 'vitest'
import path from 'path'
import { handleReadFile, handleProposeEdit, CHAT_TOOLS } from './chat-tools'

describe('CHAT_TOOLS', () => {
  it('exports two tools with correct names', () => {
    expect(CHAT_TOOLS).toHaveLength(2)
    const names = CHAT_TOOLS.map(t => t.name)
    expect(names).toContain('read_file')
    expect(names).toContain('propose_edit')
  })
})

describe('handleReadFile', () => {
  it('returns content for spec key', async () => {
    const result = await handleReadFile('spec')
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(0)
  })

  it('returns error string for unknown key', async () => {
    const result = await handleReadFile('nonexistent' as never)
    expect(result).toMatch(/unknown file/i)
  })
})

describe('handleProposeEdit', () => {
  it('returns error for invalid JSON when editing master_resume_data', async () => {
    const result = await handleProposeEdit('master_resume_data', 'test change', 'not valid json{')
    expect(result.error).toMatch(/invalid json/i)
  })

  it('returns diff string for valid edit', async () => {
    const current = JSON.stringify({ test: true }, null, 2)
    const newContent = JSON.stringify({ test: false }, null, 2)
    // Use a temp key that maps to a real file — spec (CLAUDE.md) is safe to read
    const result = await handleProposeEdit('spec', 'test', newContent)
    // Should return a diff (not an error) — the diff may be large but should be a string
    expect(typeof result.diff).toBe('string')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run lib/chat-tools.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Create `lib/chat-tools.ts`**

```typescript
import fs from 'fs'
import path from 'path'
import { createPatch } from 'diff'
import type Anthropic from '@anthropic-ai/sdk'

const ROOT = process.cwd()

const FILE_MAP: Record<string, string> = {
  master_resume_data: path.join(ROOT, 'pipeline', 'master_resume_data.json'),
  claude_full:        path.join(ROOT, 'docs', 'reference', 'CLAUDE-full.md'),
  ats_guidelines:     path.join(ROOT, 'docs', 'reference', 'ats-guidelines.md'),
  ats_system:         path.join(ROOT, 'docs', 'reference', 'ats-system-prompt.md'),
  spec:               path.join(ROOT, 'CLAUDE.md'),
}

export type FileKey = keyof typeof FILE_MAP

export const CHAT_TOOLS: Anthropic.Tool[] = [
  {
    name: 'read_file',
    description: 'Read a profile file. Use before proposing edits.',
    input_schema: {
      type: 'object' as const,
      properties: {
        file: { type: 'string', enum: Object.keys(FILE_MAP) },
      },
      required: ['file'],
    },
  },
  {
    name: 'propose_edit',
    description: 'Propose a change to a profile file. The user must Accept before the file is written.',
    input_schema: {
      type: 'object' as const,
      properties: {
        file:        { type: 'string', enum: Object.keys(FILE_MAP) },
        description: { type: 'string', description: 'One-sentence summary of what changes and why' },
        new_content: { type: 'string', description: 'Full new file content (entire file, not a patch)' },
      },
      required: ['file', 'description', 'new_content'],
    },
  },
]

export async function handleReadFile(file: FileKey): Promise<string> {
  const filePath = FILE_MAP[file]
  if (!filePath) return `Error: unknown file key "${file}"`
  try {
    const content = fs.readFileSync(filePath, 'utf8')
    return content.length > 8000 ? content.slice(0, 8000) + '\n[truncated]' : content
  } catch {
    return `Error: could not read ${file}`
  }
}

export interface ProposeEditResult {
  diff?: string
  error?: string
}

export async function handleProposeEdit(
  file: FileKey,
  description: string,
  new_content: string,
): Promise<ProposeEditResult> {
  const filePath = FILE_MAP[file]
  if (!filePath) return { error: `Unknown file key "${file}"` }

  if (file === 'master_resume_data') {
    try { JSON.parse(new_content) } catch {
      return { error: 'Invalid JSON: new_content did not parse. Fix the JSON and try again.' }
    }
  }

  let current = ''
  try { current = fs.readFileSync(filePath, 'utf8') } catch { /* file may not exist yet */ }

  const diff = createPatch(file, current, new_content, 'current', 'proposed')
  return { diff }
}
```

> **Note:** After Task 4 (`/api/chat`) is done, `handleProposeEdit` will also store the pending edit in `app_settings`. That storage step is added in Task 4 to keep this module focused.

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run lib/chat-tools.test.ts
```
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/chat-tools.ts lib/chat-tools.test.ts
git commit -m "feat: add chat-tools read_file and propose_edit handlers"
```

---

### Task 4: `POST /api/chat` SSE stream

**Files:**
- Create: `app/api/chat/route.ts`

- [ ] **Step 1: Create the route**

```typescript
import { NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import Anthropic from '@anthropic-ai/sdk'
import { getDb } from '@/lib/db'
import { CHAT_TOOLS, handleReadFile, handleProposeEdit, type FileKey } from '@/lib/chat-tools'
import { PATHS } from '@/lib/paths'
import fs from 'fs'

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

function buildMessages(rows: Array<{ role: string; content: string | null; tool_calls: string | null }>): Anthropic.MessageParam[] {
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
    const content: Anthropic.ContentBlock[] = []
    if (r.content) content.push({ type: 'text', text: r.content })
    content.push(...toolCalls)
    return { role: 'assistant' as const, content }
  })
}

export async function POST(req: Request) {
  const { sessionId, message } = await req.json() as { sessionId: string; message: string }
  if (!sessionId || !message) return NextResponse.json({ error: 'sessionId and message required' }, { status: 400 })

  const msgId = randomUUID()
  getDb().prepare('INSERT INTO chat_messages (id, session_id, role, content) VALUES (?, ?, ?, ?)')
    .run(msgId, sessionId, 'user', message)

  const history = getDb().prepare(
    'SELECT role, content, tool_calls FROM chat_messages WHERE session_id = ? ORDER BY created_at ASC LIMIT 20'
  ).all(sessionId) as Array<{ role: string; content: string | null; tool_calls: string | null }>

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: Record<string, unknown>) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`))

      try {
        const client = new Anthropic()
        let assistantText = ''
        const toolBlocks: Anthropic.ToolUseBlock[] = []
        const toolResults: Array<{ id: string; result: string }> = []

        const apiStream = client.messages.stream({
          model: 'claude-opus-4-7',
          max_tokens: 4096,
          system: SYSTEM_PROMPT,
          tools: CHAT_TOOLS,
          messages: buildMessages(history),
        })

        for await (const event of apiStream) {
          if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
            assistantText += event.delta.text
            send({ type: 'text', delta: event.delta.text })
          }

          if (event.type === 'content_block_start' && event.content_block.type === 'tool_use') {
            toolBlocks.push({ ...event.content_block, input: {} } as Anthropic.ToolUseBlock)
          }

          if (event.type === 'content_block_delta' && event.delta.type === 'input_json_delta') {
            const last = toolBlocks[toolBlocks.length - 1]
            if (last) {
              // accumulate raw JSON string
              (last as Anthropic.ToolUseBlock & { _raw?: string })._raw =
                ((last as Anthropic.ToolUseBlock & { _raw?: string })._raw ?? '') + event.delta.partial_json
            }
          }

          if (event.type === 'message_stop') {
            // Parse accumulated tool inputs
            for (const block of toolBlocks) {
              try {
                const raw = (block as Anthropic.ToolUseBlock & { _raw?: string })._raw ?? '{}'
                block.input = JSON.parse(raw)
              } catch { block.input = {} }

              let toolResult = ''

              if (block.name === 'read_file') {
                const { file } = block.input as { file: FileKey }
                toolResult = await handleReadFile(file)
              } else if (block.name === 'propose_edit') {
                const { file, description, new_content } = block.input as { file: FileKey; description: string; new_content: string }
                const result = await handleProposeEdit(file, description, new_content)
                if (result.error) {
                  toolResult = `Error: ${result.error}`
                } else {
                  // Store pending edit
                  const pendingKey = `pending_edit:${sessionId}`
                  getDb().prepare('INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
                    .run(pendingKey, JSON.stringify({ file, description, new_content }))
                  send({ type: 'diff', file, description, diff: result.diff })
                  toolResult = 'Edit proposed — pending user approval'
                }
              }

              toolResults.push({ id: block.id, result: toolResult })
            }

            // Save assistant message
            const assistantId = randomUUID()
            getDb().prepare('INSERT INTO chat_messages (id, session_id, role, content, tool_calls) VALUES (?, ?, ?, ?, ?)')
              .run(assistantId, sessionId, 'assistant', assistantText || null, toolBlocks.length ? JSON.stringify(toolBlocks) : null)

            // Save tool results as a pseudo-message for history reconstruction
            if (toolResults.length > 0) {
              const toolMsgId = randomUUID()
              getDb().prepare('INSERT INTO chat_messages (id, session_id, role, content, tool_calls) VALUES (?, ?, ?, ?, ?)')
                .run(toolMsgId, sessionId, 'tool', null, JSON.stringify(toolResults))
            }
          }
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
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' },
  })
}
```

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/api/chat/route.ts
git commit -m "feat: add POST /api/chat SSE stream with tool use"
```

---

### Task 5: `POST /api/chat/apply` — accept or reject pending edit

**Files:**
- Create: `app/api/chat/apply/route.ts`

- [ ] **Step 1: Create the route**

```typescript
import fs from 'fs'
import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export async function POST(req: Request) {
  const { sessionId, accept } = await req.json() as { sessionId: string; accept: boolean }
  if (!sessionId) return NextResponse.json({ error: 'sessionId required' }, { status: 400 })

  const pendingKey = `pending_edit:${sessionId}`
  const row = getDb().prepare('SELECT value FROM app_settings WHERE key = ?').get(pendingKey) as { value: string } | undefined

  if (!row) return NextResponse.json({ error: 'No pending edit' }, { status: 404 })

  const { file, description: _desc, new_content } = JSON.parse(row.value) as {
    file: string
    description: string
    new_content: string
  }

  getDb().prepare('DELETE FROM app_settings WHERE key = ?').run(pendingKey)

  if (!accept) return NextResponse.json({ ok: true, applied: false })

  const FILE_MAP: Record<string, string> = {
    master_resume_data: `${process.cwd()}/pipeline/master_resume_data.json`,
    claude_full:        `${process.cwd()}/docs/reference/CLAUDE-full.md`,
    ats_guidelines:     `${process.cwd()}/docs/reference/ats-guidelines.md`,
    ats_system:         `${process.cwd()}/docs/reference/ats-system-prompt.md`,
    spec:               `${process.cwd()}/CLAUDE.md`,
  }

  const filePath = FILE_MAP[file]
  if (!filePath) return NextResponse.json({ error: 'Unknown file' }, { status: 400 })

  if (file === 'master_resume_data') {
    try { JSON.parse(new_content) } catch {
      return NextResponse.json({ error: 'Invalid JSON in proposed content' }, { status: 422 })
    }
  }

  fs.writeFileSync(filePath, new_content, 'utf8')
  return NextResponse.json({ ok: true, applied: true, file })
}
```

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add app/api/chat/apply/route.ts
git commit -m "feat: add POST /api/chat/apply accept/reject endpoint"
```

---

### Task 6: `GET /api/chat/sessions`

**Files:**
- Create: `app/api/chat/sessions/route.ts`

- [ ] **Step 1: Create the route**

```typescript
import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export async function GET() {
  const sessions = getDb().prepare(`
    SELECT
      session_id,
      MIN(created_at) as started_at,
      MAX(created_at) as last_at,
      (SELECT content FROM chat_messages m2
       WHERE m2.session_id = m.session_id AND m2.role = 'user'
       ORDER BY created_at ASC LIMIT 1) as first_message
    FROM chat_messages m
    GROUP BY session_id
    ORDER BY last_at DESC
    LIMIT 50
  `).all()

  return NextResponse.json(sessions)
}
```

- [ ] **Step 2: Commit**

```bash
git add app/api/chat/sessions/route.ts
git commit -m "feat: add GET /api/chat/sessions sidebar list"
```

---

### Task 7: `ChatDiff` component

**Files:**
- Create: `components/ChatDiff.tsx`

- [ ] **Step 1: Create the component**

```typescript
'use client'
import { useState } from 'react'

interface Props {
  file: string
  description: string
  diff: string
  sessionId: string
  onApplied: (accepted: boolean) => void
}

export default function ChatDiff({ file, description, diff, sessionId, onApplied }: Props) {
  const [state, setState] = useState<'pending' | 'accepted' | 'rejected'>(' pending')
  const [busy, setBusy] = useState(false)

  const apply = async (accept: boolean) => {
    setBusy(true)
    await fetch('/api/chat/apply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, accept }),
    })
    setState(accept ? 'accepted' : 'rejected')
    setBusy(false)
    onApplied(accept)
  }

  const lines = diff.split('\n')

  return (
    <div className="rounded border border-zinc-700 bg-zinc-900 my-2 overflow-hidden">
      <div className="px-3 py-2 border-b border-zinc-700 flex items-center justify-between">
        <div>
          <span className="text-xs font-mono text-indigo-300">{file}</span>
          <span className="ml-2 text-xs text-zinc-400">{description}</span>
        </div>
        {state === 'pending' && (
          <div className="flex gap-2">
            <button
              disabled={busy}
              onClick={() => apply(true)}
              className="px-2 py-0.5 text-xs bg-green-700 hover:bg-green-600 text-white rounded disabled:opacity-50"
            >Accept</button>
            <button
              disabled={busy}
              onClick={() => apply(false)}
              className="px-2 py-0.5 text-xs bg-zinc-700 hover:bg-zinc-600 text-zinc-300 rounded disabled:opacity-50"
            >Reject</button>
          </div>
        )}
        {state === 'accepted' && <span className="text-xs text-green-400">Applied ✓</span>}
        {state === 'rejected' && <span className="text-xs text-zinc-500">Declined</span>}
      </div>
      <pre className="overflow-x-auto text-xs font-mono px-3 py-2 max-h-60 leading-relaxed">
        {lines.map((line, i) => (
          <div
            key={i}
            className={
              line.startsWith('+') && !line.startsWith('+++') ? 'text-green-400' :
              line.startsWith('-') && !line.startsWith('---') ? 'text-red-400' :
              'text-zinc-400'
            }
          >{line}</div>
        ))}
      </pre>
    </div>
  )
}
```

Fix the typo in `useState` initial value — it should be `'pending'` not `' pending'`. Correct version:
```typescript
  const [state, setState] = useState<'pending' | 'accepted' | 'rejected'>('pending')
```

- [ ] **Step 2: Commit**

```bash
git add components/ChatDiff.tsx
git commit -m "feat: add ChatDiff component with Accept/Reject buttons"
```

---

### Task 8: `app/chat/page.tsx`

**Files:**
- Create: `app/chat/page.tsx`

- [ ] **Step 1: Create the page**

```typescript
'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { randomUUID } from 'crypto'
import ChatDiff from '@/components/ChatDiff'

interface Session {
  session_id: string
  started_at: string
  first_message: string | null
}

type ChatEvent =
  | { type: 'text';    delta: string }
  | { type: 'diff';    file: string; description: string; diff: string }
  | { type: 'done' }
  | { type: 'error';   message: string }

interface Message {
  id: string
  role: 'user' | 'assistant'
  text: string
  diff?: { file: string; description: string; diff: string }
}

export default function ChatPage() {
  const [sessions, setSessions] = useState<Session[]>([])
  const [sessionId, setSessionId] = useState<string>(() => randomUUID())
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  const loadSessions = useCallback(() => {
    fetch('/api/chat/sessions').then(r => r.ok ? r.json() : []).then(setSessions)
  }, [])

  useEffect(() => { loadSessions() }, [loadSessions])
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  const send = async () => {
    const text = input.trim()
    if (!text || streaming) return
    setInput('')

    const userMsg: Message = { id: randomUUID(), role: 'user', text }
    setMessages(prev => [...prev, userMsg])
    setStreaming(true)

    const assistantId = randomUUID()
    setMessages(prev => [...prev, { id: assistantId, role: 'assistant', text: '' }])

    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, message: text }),
    })
    if (!res.body) { setStreaming(false); return }

    const reader = res.body.getReader()
    const dec = new TextDecoder()
    let buf = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buf += dec.decode(value, { stream: true })
      const parts = buf.split('\n\n')
      buf = parts.pop() ?? ''
      for (const part of parts) {
        if (!part.startsWith('data: ')) continue
        try {
          const event: ChatEvent = JSON.parse(part.slice(6))
          if (event.type === 'text') {
            setMessages(prev => prev.map(m =>
              m.id === assistantId ? { ...m, text: m.text + event.delta } : m
            ))
          } else if (event.type === 'diff') {
            setMessages(prev => prev.map(m =>
              m.id === assistantId ? { ...m, diff: { file: event.file, description: event.description, diff: event.diff } } : m
            ))
          } else if (event.type === 'done') {
            setStreaming(false)
            loadSessions()
          } else if (event.type === 'error') {
            setMessages(prev => prev.map(m =>
              m.id === assistantId ? { ...m, text: m.text + `\n\nError: ${event.message}` } : m
            ))
            setStreaming(false)
          }
        } catch { /* ignore parse errors */ }
      }
    }
    setStreaming(false)
  }

  const startNew = () => {
    setSessionId(randomUUID())
    setMessages([])
  }

  const fmtDate = (iso: string) => new Date(iso).toLocaleDateString()

  return (
    <div className="flex h-screen bg-zinc-950 text-zinc-100">
      {/* Sidebar */}
      <div className="w-48 flex-shrink-0 border-r border-zinc-800 flex flex-col">
        <div className="p-3 border-b border-zinc-800">
          <button
            onClick={startNew}
            className="w-full text-xs text-indigo-400 hover:text-indigo-300 text-left"
          >+ New session</button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {sessions.map(s => (
            <button
              key={s.session_id}
              onClick={() => { setSessionId(s.session_id); setMessages([]) }}
              className={`w-full text-left px-3 py-2 text-xs hover:bg-zinc-800 ${s.session_id === sessionId ? 'bg-zinc-800' : ''}`}
            >
              <p className="text-zinc-300 truncate">{s.first_message ?? '(empty)'}</p>
              <p className="text-zinc-600">{fmtDate(s.started_at)}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Chat area */}
      <div className="flex-1 flex flex-col">
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {messages.map(m => (
            <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-2xl ${m.role === 'user' ? 'bg-indigo-900/40 rounded-lg px-4 py-2' : ''}`}>
                <p className="text-sm whitespace-pre-wrap">{m.text}</p>
                {m.diff && (
                  <ChatDiff
                    file={m.diff.file}
                    description={m.diff.description}
                    diff={m.diff.diff}
                    sessionId={sessionId}
                    onApplied={() => {}}
                  />
                )}
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="border-t border-zinc-800 px-4 py-3 flex gap-2">
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
            disabled={streaming}
            rows={2}
            placeholder="Ask Claude to update your profile…"
            className="flex-1 bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-sm resize-none focus:outline-none focus:border-indigo-500 disabled:opacity-50"
          />
          <button
            onClick={send}
            disabled={streaming || !input.trim()}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm rounded disabled:opacity-50"
          >Send</button>
        </div>
      </div>
    </div>
  )
}
```

> Note: `randomUUID` is a Node.js built-in — it must be used in a `'use client'` component with `crypto.randomUUID()` instead. Change the import to: `const newId = () => crypto.randomUUID()` and replace `randomUUID()` calls with `newId()`.

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Manual smoke test**

```bash
npm run dev
```
Navigate to `http://localhost:3000/chat`. Type "Read my master_resume_data and tell me how many projects I have." Verify:
- User message appears.
- Claude streams text back.
- No errors in console.

Type "Add a new project called TestProject to master_resume_data." Verify:
- Claude reads the file first (text about reading).
- A `ChatDiff` block appears with colored diff.
- Clicking Accept writes the file (check `pipeline/master_resume_data.json`).

- [ ] **Step 4: Commit**

```bash
git add app/chat/page.tsx
git commit -m "feat: add chat page with SSE message streaming and diff UI"
```

---

### Task 9: Link sidebar navigation to Chat page

- [ ] **Step 1: Add Chat link to `components/Sidebar.tsx`**

Open `components/Sidebar.tsx` and add a nav link to `/chat`:
```typescript
<Link href="/chat" className="block px-4 py-2 text-sm text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 rounded">
  Chat
</Link>
```

- [ ] **Step 2: Commit**

```bash
git add components/Sidebar.tsx
git commit -m "feat: add Chat link to sidebar navigation"
```

# Chat Page — Profile Editor Agent — Design Spec

**Date:** 2026-05-08
**Status:** Approved

## Goal

A conversational interface where the user can ask Claude to revise, update, or add content to their resume profile (`master_resume_data.json`) and reference docs (`CLAUDE.md`, `docs/reference/*.md`). Claude proposes structured diffs; the user approves before any file is written. No silent writes.

## Architecture Overview

```
User types request
  → POST /api/chat (SSE stream)
    → Claude reads files via tools
    → Claude calls propose_edit(file, patch)
      → server computes diff, streams { type: 'diff', ... } SSE event
        → ChatDiff component shows before/after
          → user clicks Accept
            → POST /api/chat/apply writes file
```

## Data Layer (`lib/db.ts`)

New `chat_messages` table:
```sql
CREATE TABLE IF NOT EXISTS chat_messages (
  id         TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  role       TEXT NOT NULL,       -- 'user' | 'assistant' | 'tool'
  content    TEXT,
  tool_calls TEXT,                -- JSON array of tool call objects
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_chat_session ON chat_messages(session_id, created_at);
```

Sessions are identified by a UUID. The UI creates a new session per page visit or lets the user start a new one. Sessions are listed in a sidebar.

## Tools (`lib/chat-tools.ts`)

Two tools passed to the Claude API on every `/api/chat` call:

### `read_file`
```typescript
{
  name: 'read_file',
  description: 'Read a profile file. Use before proposing edits.',
  input_schema: {
    type: 'object',
    properties: {
      file: { type: 'string', enum: ['master_resume_data', 'claude_full', 'ats_guidelines', 'ats_system', 'spec'] }
    },
    required: ['file']
  }
}
```
Handler returns the file contents as a string (truncated to 8000 chars if needed).

### `propose_edit`
```typescript
{
  name: 'propose_edit',
  description: 'Propose a change to a profile file. The user must Accept before the file is written.',
  input_schema: {
    type: 'object',
    properties: {
      file:        { type: 'string', enum: ['master_resume_data', 'claude_full', 'ats_guidelines', 'ats_system', 'spec'] },
      description: { type: 'string', description: 'One-sentence summary of what changes and why' },
      new_content: { type: 'string', description: 'Full new file content (not a patch — send the whole file)' }
    },
    required: ['file', 'description', 'new_content']
  }
}
```

When Claude calls `propose_edit`, the server:
1. Reads the current file
2. Computes a unified diff (current → new_content)
3. Stores the pending edit in `app_settings` keyed by `pending_edit:<session_id>`
4. Streams a `{ type: 'diff', file, description, diff }` SSE event to the client

The client renders the diff and shows Accept/Reject buttons. No file is touched yet.

## API Routes

### `POST /api/chat` (SSE stream)

Request body:
```json
{ "sessionId": "uuid", "message": "Add a new project called HomeBoard with .NET stack" }
```

1. Append user message to `chat_messages`
2. Load full session history from `chat_messages` (last 20 messages)
3. Build Claude messages array
4. Stream `client.messages.stream(...)` with the two tools
5. Handle tool calls inline (read_file → return content as tool result; propose_edit → compute diff, stream event, return "pending user approval" as tool result so Claude can explain the diff)
6. Append assistant message + tool calls to `chat_messages`
7. Stream `{ type: 'done' }` to close the SSE

### `POST /api/chat/apply`

Request body: `{ "sessionId": "uuid", "accept": true | false }`

- `accept: true` → read pending edit from `app_settings`, write file, clear pending edit, stream `{ type: 'applied', file }`
- `accept: false` → clear pending edit, no write

### `GET /api/chat/sessions`

Returns list of sessions with last message preview for the sidebar.

## System Prompt for Chat Agent

The system prompt includes:
- Candidate profile summary (name, work auth, current roles, positioning)
- File map: what each editable file contains
- Hard constraints (tagline ≤76c, bullet ≤116c, bullet formula)
- Instruction: always read a file before proposing edits; one propose_edit per response turn

## UI (`app/chat/page.tsx`)

Layout:
```
┌─ Sidebar ─┬──────── Chat ──────────────────────────┐
│ Sessions  │  [message list]                         │
│ ─────── │                                          │
│ May 8    │  You: Add HomeBoard project              │
│ May 7    │  Claude: I'll read your projects first…  │
│          │  ── reading master_resume_data ──        │
│          │  Claude: Here's what I'm proposing:      │
│          │  ┌─ ChatDiff: master_resume_data ──────┐ │
│          │  │ + { "id": "homeboard", ...}         │ │
│          │  │ [Accept] [Reject]                   │ │
│          │  └─────────────────────────────────────┘ │
│ [+ New]  │  [input box]                [Send]       │
└──────────┴────────────────────────────────────────┘
```

### `components/ChatDiff.tsx`

Renders a side-by-side or unified diff of a proposed file change. Uses `diff` npm library for diff computation display. Shows:
- File name + description
- Colored diff (red = removed, green = added)
- Accept / Reject buttons
- After Accept: "Applied ✓" state; after Reject: "Declined" state

## Streaming Pattern

Same SSE pattern as the generation pipeline — `ReadableStream` with `text/event-stream`. Events:
```typescript
type ChatEvent =
  | { type: 'text';    delta: string }
  | { type: 'diff';    file: string; description: string; diff: string }
  | { type: 'applied'; file: string }
  | { type: 'done' }
  | { type: 'error';   message: string }
```

## Safety Constraints

- `propose_edit` always sends the full new file content — the server verifies it is valid JSON if editing `master_resume_data.json` before writing
- `new_content` for JSON files must parse cleanly; server rejects and returns error if not
- No tool can delete files, run shell commands, or write outside the allowed file set
- The allowed file enum is enforced server-side; Claude cannot request arbitrary paths

## Error Handling

- Claude exceeds token limit mid-stream: stream `{ type: 'error', message: 'Response truncated' }` and save partial message
- File write fails: stream `{ type: 'error' }`, revert `app_settings` pending edit
- Tool returns error: Claude receives the error as a tool result and can explain it to the user

## Dependencies

```bash
npm install diff        # for diff display in ChatDiff component
```

## Testing

- Unit test: `read_file` handler returns correct content for each file key
- Unit test: `propose_edit` handler stores pending edit and returns diff event
- Unit test: `/api/chat/apply` writes file on accept, clears pending on reject
- Manual: chat "Add a project called HomeBoard" → verify diff shows correct JSON addition → Accept → verify file updated

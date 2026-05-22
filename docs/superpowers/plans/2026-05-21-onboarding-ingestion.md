# Onboarding Ingestion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the demo-seed new-user flow with a source-card onboarding board where users inject their own data (URLs via Firecrawl, GitHub profiles via API, pasted text), AI extracts it into the existing profile schema, and a single merge call produces a reviewed profile ready for resume generation.

**Architecture:** Three per-source extraction endpoints (`/api/ingest/{paste,github,url}`) each call AI with a source-specific system prompt and return a sparse partial profile, stored in a new `ingestion_sources` DB table. A `/api/ingest/merge` endpoint takes all source IDs, runs one AI merge call (most-specific-wins + explicit conflict flagging), and creates a `resume_profile` on accept. The `/onboarding` route is shown to users with zero profiles via a client-side gate in the app layout. Demo seed is removed from the new-user path.

**Tech Stack:** Next.js 14 App Router, Vercel AI SDK v6 (`generateText` + `jsonSchema` from `"ai"`), Firecrawl JS SDK (optional, fetch fallback), GitHub REST API (public endpoints, no auth token required), `better-sqlite3` / `getAdapter()` from `lib/db-adapter`, Vitest, `auth()` from `lib/auth`.

---

## File Map

**New files:**
```
lib/ingest/types.ts                      — SparseProfile, IngestionSource, MergeResult types
lib/ingest/db.ts                         — ingestion_sources CRUD (all async, getAdapter-based)
lib/ingest/extract-paste.ts              — freeform text → AI → SparseProfile
lib/ingest/extract-github.ts             — GitHub API fetch → AI → SparseProfile
lib/ingest/extract-url.ts                — Firecrawl/fetch-fallback → AI → SparseProfile
lib/ingest/merge.ts                      — SparseProfile[] → AI → MergeResult
lib/ingest/db.test.ts
lib/ingest/extract-paste.test.ts
lib/ingest/extract-github.test.ts
lib/ingest/extract-url.test.ts
lib/ingest/merge.test.ts
app/api/ingest/paste/route.ts
app/api/ingest/github/route.ts
app/api/ingest/url/route.ts
app/api/ingest/merge/route.ts
app/api/ingest/sources/route.ts          — GET list + DELETE per source
app/(app)/onboarding/page.tsx
components/onboarding/SmartInput.tsx
components/onboarding/SourceCard.tsx
components/onboarding/SourceBoard.tsx
components/onboarding/ProfileReview.tsx
components/onboarding/ConflictBanner.tsx
components/OnboardingGate.tsx
```

**Modified files:**
```
lib/db.ts                                — add ingestion_sources CREATE TABLE to initSchema()
lib/db-adapter.ts                        — add ingestion_sources to NEON_SCHEMA
app/api/profiles/route.ts               — remove demo-seed path in POST handler
app/(app)/settings/page.tsx             — add Firecrawl API key input field
app/api/settings/route.ts               — add firecrawl_key GET/POST handling
app/(app)/layout.tsx                     — wrap children with OnboardingGate
```

---

## Task 1: Types + DB schema

**Files:**
- Create: `lib/ingest/types.ts`
- Modify: `lib/db.ts`
- Modify: `lib/db-adapter.ts`

- [ ] **Step 1: Create `lib/ingest/types.ts`**

```typescript
// lib/ingest/types.ts

export type IngestionSourceType   = 'url' | 'github' | 'paste'
export type IngestionSourceStatus = 'pending' | 'processing' | 'done' | 'failed'

export interface SparseContact {
  name?:     string
  email?:    string
  phone?:    string
  location?: string
  linkedin?: string
  github?:   string
  website?:  string
}

export interface SparseExperienceEntry {
  id:        string   // required — lowercase slug, e.g. "acme-corp"
  title?:    string
  company?:  string
  location?: string
  dates?:    string
  bullets?:  { genai: string[] }
}

export interface SparseProjectEntry {
  id:           string  // required — lowercase slug
  name?:        string
  url?:         string
  short_stack?: string  // ≤40 chars
  dates?:       string
  bullets?:     string[]
}

export interface SparseProfile {
  contact?:           SparseContact
  experience?:        SparseExperienceEntry[]
  projects?:          SparseProjectEntry[]
  skills?:            { genai?: Record<string, string> }
  candidate_profile?: { narrative?: string }
}

export interface ConflictEntry {
  field:       string   // e.g. "contact.name"
  description: string
  sources: Array<{
    sourceId:   string
    sourceType: IngestionSourceType
    value:      unknown
  }>
}

export interface MergeResult {
  profile:   SparseProfile
  conflicts: ConflictEntry[]
}

// DB row shape (snake_case, as stored)
export interface IngestionSourceRow {
  id:                string
  user_id:           string
  type:              IngestionSourceType
  input_raw:         string
  status:            IngestionSourceStatus
  extracted_partial: string | null   // JSON string of SparseProfile
  error_msg:         string | null
  created_at:        number
}

// Application shape (camelCase)
export interface IngestionSource {
  id:               string
  userId:           string
  type:             IngestionSourceType
  inputRaw:         string
  status:           IngestionSourceStatus
  extractedPartial: SparseProfile | null
  errorMsg:         string | null
  createdAt:        number
}
```

- [ ] **Step 2: Add `ingestion_sources` table to `lib/db.ts` `initSchema()`**

Find the last `CREATE TABLE IF NOT EXISTS` block inside the `db.exec(...)` call in `initSchema()`. Append before the closing backtick:

```sql
    CREATE TABLE IF NOT EXISTS ingestion_sources (
      id                TEXT PRIMARY KEY,
      user_id           TEXT NOT NULL,
      type              TEXT NOT NULL CHECK(type IN ('url', 'github', 'paste')),
      input_raw         TEXT NOT NULL,
      status            TEXT NOT NULL DEFAULT 'pending'
                          CHECK(status IN ('pending', 'processing', 'done', 'failed')),
      extracted_partial TEXT,
      error_msg         TEXT,
      created_at        INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE INDEX IF NOT EXISTS idx_ingest_sources_user
      ON ingestion_sources(user_id, created_at DESC);
```

- [ ] **Step 3: Add same table to `lib/db-adapter.ts` `NEON_SCHEMA`**

Find `NEON_SCHEMA` string. Add before its closing backtick:

```sql
  CREATE TABLE IF NOT EXISTS ingestion_sources (
    id                TEXT PRIMARY KEY,
    user_id           TEXT NOT NULL,
    type              TEXT NOT NULL,
    input_raw         TEXT NOT NULL,
    status            TEXT NOT NULL DEFAULT 'pending',
    extracted_partial TEXT,
    error_msg         TEXT,
    created_at        BIGINT NOT NULL DEFAULT extract(epoch from now())::bigint
  );
  CREATE INDEX IF NOT EXISTS idx_ingest_sources_user
    ON ingestion_sources(user_id, created_at DESC);
```

- [ ] **Step 4: Verify schema compiles**

```bash
npx tsx -e "
import Database from 'better-sqlite3';
import { initSchema } from './lib/db';
const db = new Database(':memory:');
initSchema(db);
const t = db.prepare(\"SELECT name FROM sqlite_master WHERE type='table' AND name='ingestion_sources'\").get();
console.log(t ? '✓ table created' : '✗ missing');
"
```

Expected: `✓ table created`

- [ ] **Step 5: Commit**

```bash
git add lib/ingest/types.ts lib/db.ts lib/db-adapter.ts
git commit -m "feat(ingest): types + ingestion_sources DB schema"
```

---

## Task 2: Ingestion sources CRUD lib

**Files:**
- Create: `lib/ingest/db.ts`
- Create: `lib/ingest/db.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// lib/ingest/db.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import Database from 'better-sqlite3'
import { initSchema } from '../db'

let mockDb: ReturnType<typeof Database>

vi.mock('../db-adapter', () => ({
  getAdapter: vi.fn().mockImplementation(async () => ({
    query:    async (sql: string, p: unknown[] = []) => mockDb.prepare(sql).all(...p),
    queryOne: async (sql: string, p: unknown[] = []) => mockDb.prepare(sql).get(...p),
    run:      async (sql: string, p: unknown[] = []) => { mockDb.prepare(sql).run(...p) },
    runInTransaction: async (ops: Array<{ sql: string; params?: unknown[] }>) => {
      const txn = mockDb.transaction(() => {
        for (const { sql, params = [] } of ops) {
          mockDb.prepare(sql).run(...params)
        }
      })
      txn()
    },
  })),
}))

beforeEach(() => {
  vi.resetModules()
  mockDb = new Database(':memory:')
  initSchema(mockDb)
})

describe('createIngestionSource', () => {
  it('inserts a pending row and returns it', async () => {
    const { createIngestionSource } = await import('./db')
    const src = await createIngestionSource('user-1', 'paste', 'hello world')
    expect(src.userId).toBe('user-1')
    expect(src.type).toBe('paste')
    expect(src.inputRaw).toBe('hello world')
    expect(src.status).toBe('pending')
    expect(src.extractedPartial).toBeNull()
  })
})

describe('updateIngestionSource', () => {
  it('marks source as done with a partial', async () => {
    const { createIngestionSource, updateIngestionSource, getIngestionSource } = await import('./db')
    const src = await createIngestionSource('user-1', 'paste', 'text')
    const partial = { contact: { name: 'Jane' } }
    await updateIngestionSource(src.id, 'user-1', { status: 'done', extractedPartial: partial })
    const updated = await getIngestionSource(src.id, 'user-1')
    expect(updated?.status).toBe('done')
    expect(updated?.extractedPartial?.contact?.name).toBe('Jane')
  })
})

describe('listIngestionSources', () => {
  it('returns only sources for the given user', async () => {
    const { createIngestionSource, listIngestionSources } = await import('./db')
    await createIngestionSource('user-1', 'url', 'https://example.com')
    await createIngestionSource('user-2', 'paste', 'other')
    const list = await listIngestionSources('user-1')
    expect(list).toHaveLength(1)
    expect(list[0].type).toBe('url')
  })
})

describe('deleteIngestionSource', () => {
  it('removes the row; returns false if not found', async () => {
    const { createIngestionSource, deleteIngestionSource, getIngestionSource } = await import('./db')
    const src = await createIngestionSource('user-1', 'github', 'https://github.com/foo')
    expect(await deleteIngestionSource(src.id, 'user-1')).toBe(true)
    expect(await getIngestionSource(src.id, 'user-1')).toBeNull()
    expect(await deleteIngestionSource(src.id, 'user-1')).toBe(false)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

```bash
npx vitest run lib/ingest/db.test.ts
```

Expected: FAIL — `./db` module not found.

- [ ] **Step 3: Implement `lib/ingest/db.ts`**

```typescript
// lib/ingest/db.ts
import { randomUUID } from 'crypto'
import { getAdapter } from '../db-adapter'
import type {
  IngestionSource, IngestionSourceRow,
  IngestionSourceType, IngestionSourceStatus, SparseProfile,
} from './types'

function rowToSource(row: IngestionSourceRow): IngestionSource {
  return {
    id:               row.id,
    userId:           row.user_id,
    type:             row.type,
    inputRaw:         row.input_raw,
    status:           row.status,
    extractedPartial: row.extracted_partial
      ? (JSON.parse(row.extracted_partial) as SparseProfile)
      : null,
    errorMsg:         row.error_msg,
    createdAt:        row.created_at,
  }
}

export async function createIngestionSource(
  userId: string, type: IngestionSourceType, inputRaw: string
): Promise<IngestionSource> {
  const db = await getAdapter()
  const id = randomUUID()
  await db.run(
    `INSERT INTO ingestion_sources (id, user_id, type, input_raw, status)
     VALUES (?, ?, ?, ?, 'pending')`,
    [id, userId, type, inputRaw],
  )
  const row = await db.queryOne<IngestionSourceRow>(
    `SELECT * FROM ingestion_sources WHERE id = ?`, [id],
  )
  return rowToSource(row!)
}

export async function updateIngestionSource(
  id: string, userId: string,
  updates: {
    status:            IngestionSourceStatus
    extractedPartial?: SparseProfile | null
    errorMsg?:         string | null
  },
): Promise<void> {
  const db = await getAdapter()
  await db.run(
    `UPDATE ingestion_sources
     SET status = ?, extracted_partial = ?, error_msg = ?
     WHERE id = ? AND user_id = ?`,
    [
      updates.status,
      updates.extractedPartial !== undefined
        ? JSON.stringify(updates.extractedPartial)
        : null,
      updates.errorMsg ?? null,
      id, userId,
    ],
  )
}

export async function getIngestionSource(
  id: string, userId: string
): Promise<IngestionSource | null> {
  const db = await getAdapter()
  const row = await db.queryOne<IngestionSourceRow>(
    `SELECT * FROM ingestion_sources WHERE id = ? AND user_id = ?`, [id, userId],
  )
  return row ? rowToSource(row) : null
}

export async function listIngestionSources(userId: string): Promise<IngestionSource[]> {
  const db = await getAdapter()
  const rows = await db.query<IngestionSourceRow>(
    `SELECT * FROM ingestion_sources WHERE user_id = ? ORDER BY created_at DESC`,
    [userId],
  )
  return rows.map(rowToSource)
}

export async function deleteIngestionSource(
  id: string, userId: string
): Promise<boolean> {
  const db = await getAdapter()
  const existing = await db.queryOne<{ id: string }>(
    `SELECT id FROM ingestion_sources WHERE id = ? AND user_id = ?`, [id, userId],
  )
  if (!existing) return false
  await db.run(
    `DELETE FROM ingestion_sources WHERE id = ? AND user_id = ?`, [id, userId],
  )
  return true
}
```

- [ ] **Step 4: Run to verify passes**

```bash
npx vitest run lib/ingest/db.test.ts
```

Expected: 4 test groups, all PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/ingest/db.ts lib/ingest/db.test.ts
git commit -m "feat(ingest): ingestion_sources CRUD lib"
```

---

## Task 3: Firecrawl API key in settings

**Files:**
- Modify: `app/api/settings/route.ts`
- Modify: `app/(app)/settings/page.tsx`

- [ ] **Step 1: Check how existing settings keys are stored**

```bash
grep -n "jobs_path\|app_settings" /Users/vietquocbui/repos/ResumeLoop/app/api/settings/route.ts | head -15
```

Settings use `app_settings` table with user-scoped keys like `jobs_path:{userId}`. Follow this exact pattern.

- [ ] **Step 2: Add `firecrawl_key` read to the GET handler**

Find where `jobs_path:{userId}` is read. Add the same pattern for `firecrawl_key`:

```typescript
const firecrawlRow = await db.queryOne<{ value: string }>(
  `SELECT value FROM app_settings WHERE key = ?`,
  [`firecrawl_key:${userId}`],
)
// Add to the returned JSON object:
// firecrawl_key: firecrawlRow?.value ?? ''
```

- [ ] **Step 3: Add `firecrawl_key` write to the POST handler**

Find where `jobs_path` is written to `app_settings`. Add the same upsert for `firecrawl_key`:

```typescript
const { jobs_path, output_path, outreach_path, firecrawl_key } = body as {
  jobs_path?: string; output_path?: string; outreach_path?: string; firecrawl_key?: string
}

if (firecrawl_key !== undefined) {
  await db.run(
    `INSERT INTO app_settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [`firecrawl_key:${userId}`, firecrawl_key],
  )
}
```

- [ ] **Step 4: Add Firecrawl key input to `app/(app)/settings/page.tsx`**

Find the section that renders `jobs_path`. Add a new block:

```tsx
<div className="space-y-2">
  <label className="text-sm font-medium text-zinc-300">
    Firecrawl API Key
    <span className="ml-2 text-xs text-zinc-500">(optional — richer URL scraping)</span>
  </label>
  <input
    type="password"
    value={settings.firecrawl_key ?? ''}
    onChange={e => setSettings(s => ({ ...s, firecrawl_key: e.target.value }))}
    placeholder="fc-..."
    className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-sm text-zinc-200 font-mono"
  />
  <p className="text-xs text-zinc-500">
    Get a key at firecrawl.dev. Without a key, URL ingestion uses basic HTML fetch.
  </p>
</div>
```

Make sure the save handler includes `firecrawl_key: settings.firecrawl_key` in the POST body.

- [ ] **Step 5: Install Firecrawl SDK**

```bash
npm install @mendable/firecrawl-js
```

- [ ] **Step 6: Verify**

```bash
npx tsc --noEmit 2>&1 | grep -i "settings\|firecrawl" | head -10
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add app/api/settings/route.ts app/\(app\)/settings/page.tsx package.json package-lock.json
git commit -m "feat(ingest): Firecrawl API key in settings (optional)"
```

---

## Task 4: Extract-paste lib + route

**Files:**
- Create: `lib/ingest/extract-paste.ts`
- Create: `lib/ingest/extract-paste.test.ts`
- Create: `app/api/ingest/paste/route.ts`
- Create: `app/api/ingest/paste/route.test.ts`

- [ ] **Step 1: Write the failing lib test**

```typescript
// lib/ingest/extract-paste.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('ai', () => ({ generateText: vi.fn(), jsonSchema: (s: unknown) => s }))
vi.mock('../ai-client',     () => ({ getModel: vi.fn().mockReturnValue('mock-model') }))
vi.mock('../user-settings', () => ({ getActiveConfig: vi.fn().mockResolvedValue({ provider: 'anthropic', model: 'claude-sonnet-4-6' }) }))
vi.mock('../ai-usage',      () => ({ logAiUsage: vi.fn() }))

import { generateText } from 'ai'
import { extractFromPaste } from './extract-paste'

beforeEach(() => vi.clearAllMocks())

describe('extractFromPaste', () => {
  it('returns sparse profile from tool call', async () => {
    vi.mocked(generateText).mockResolvedValueOnce({
      toolCalls: [{
        toolName: 'extract_profile',
        args: {
          contact:    { name: 'Jane Doe', email: 'jane@example.com' },
          experience: [{
            id: 'acme', title: 'Engineer', company: 'Acme Corp',
            bullets: { genai: ['Built search pipeline using Elasticsearch, reducing latency 40%'] },
          }],
          projects: [],
        },
      }],
      text: '', finishReason: 'tool-calls',
      usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
    } as never)

    const result = await extractFromPaste(
      'Jane Doe, Engineer at Acme Corp. Built search pipeline using Elasticsearch.',
      'user-1', null,
    )
    expect(result.contact?.name).toBe('Jane Doe')
    expect(result.experience).toHaveLength(1)
    expect(result.experience![0].id).toBe('acme')
  })

  it('throws when AI returns no tool call', async () => {
    vi.mocked(generateText).mockResolvedValueOnce({
      toolCalls: [], text: 'some freeform text',
      finishReason: 'stop',
      usage: { inputTokens: 50, outputTokens: 10, totalTokens: 60 },
    } as never)
    await expect(extractFromPaste('some valid text about a person', 'user-1', null))
      .rejects.toThrow('extract_profile tool not called')
  })

  it('throws when input is too short', async () => {
    await expect(extractFromPaste('hi', 'user-1', null)).rejects.toThrow('too short')
  })
})
```

- [ ] **Step 2: Run to verify it fails**

```bash
npx vitest run lib/ingest/extract-paste.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `lib/ingest/extract-paste.ts`**

```typescript
// lib/ingest/extract-paste.ts
import { generateText, jsonSchema } from 'ai'
import { getModel }        from '../ai-client'
import { getActiveConfig } from '../user-settings'
import { logAiUsage }      from '../ai-usage'
import type { SparseProfile } from './types'

const MIN_LENGTH = 20

const SYSTEM_PROMPT = `You extract professional profile data from freeform text.
Input may be a LinkedIn About/Experience copy-paste, a personal bio, or plain resume text.
Extract only what is explicitly present — never invent or infer data not in the text.
IDs must be lowercase slugs: letters, digits, hyphens only (e.g. "acme-corp").
Bullet text: concise action-verb phrases 116 chars max each.
Skills genai object: keys are category labels (e.g. "Languages"), values are comma-separated techs.`

const PROFILE_SCHEMA = {
  type: 'object' as const,
  properties: {
    contact: {
      type: 'object',
      properties: {
        name: { type: 'string' }, email: { type: 'string' },
        phone: { type: 'string' }, location: { type: 'string' },
        linkedin: { type: 'string' }, github: { type: 'string' }, website: { type: 'string' },
      },
    },
    experience: {
      type: 'array',
      items: {
        type: 'object', required: ['id'],
        properties: {
          id:       { type: 'string', description: 'lowercase slug e.g. "acme-corp"' },
          title:    { type: 'string' }, company: { type: 'string' },
          location: { type: 'string' }, dates: { type: 'string' },
          bullets: {
            type: 'object', required: ['genai'],
            properties: {
              genai: { type: 'array', items: { type: 'string', maxLength: 116 }, maxItems: 6 },
            },
          },
        },
      },
    },
    projects: {
      type: 'array',
      items: {
        type: 'object', required: ['id'],
        properties: {
          id: { type: 'string' }, name: { type: 'string' }, url: { type: 'string' },
          short_stack: { type: 'string', maxLength: 40 }, dates: { type: 'string' },
          bullets: { type: 'array', items: { type: 'string', maxLength: 116 }, maxItems: 6 },
        },
      },
    },
    skills: {
      type: 'object',
      properties: { genai: { type: 'object', additionalProperties: { type: 'string' } } },
    },
  },
}

export async function extractFromPaste(
  text: string,
  userId: string,
  _cfgOverride: unknown,
): Promise<SparseProfile> {
  if (text.trim().length < MIN_LENGTH) throw new Error('Input too short to extract meaningful data')

  const cfg = await getActiveConfig(userId)
  if (!cfg) throw new Error('No AI provider configured. Go to Settings → AI to add an API key.')

  const result = await generateText({
    model:    getModel(cfg),
    system:   SYSTEM_PROMPT,
    messages: [{ role: 'user', content: `Extract profile data from this text:\n\n${text.slice(0, 20_000)}` }],
    tools: {
      extract_profile: {
        description: 'Extract structured profile data from the provided text',
        parameters:  jsonSchema<SparseProfile>(PROFILE_SCHEMA),
      },
    },
    toolChoice: 'required',
    maxTokens:  2000,
  })

  const call = result.toolCalls.find(t => t.toolName === 'extract_profile')
  if (!call) throw new Error('AI did not call extract_profile tool not called')

  await logAiUsage(userId, cfg.provider, cfg.model, 'ingest-paste',
    result.usage?.inputTokens ?? 0, result.usage?.outputTokens ?? 0)

  return call.args as SparseProfile
}
```

- [ ] **Step 4: Run to verify passes**

```bash
npx vitest run lib/ingest/extract-paste.test.ts
```

Expected: 3 tests PASS.

- [ ] **Step 5: Write the route**

```typescript
// app/api/ingest/paste/route.ts
import { NextResponse } from 'next/server'
import { auth }         from '@/lib/auth'
import { createIngestionSource, updateIngestionSource } from '@/lib/ingest/db'
import { extractFromPaste } from '@/lib/ingest/extract-paste'

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = session.user.id

  const body = await req.json() as { text?: string }
  if (!body.text?.trim()) return NextResponse.json({ error: 'text required' }, { status: 400 })

  const source = await createIngestionSource(userId, 'paste', body.text)

  try {
    await updateIngestionSource(source.id, userId, { status: 'processing' })
    const partial = await extractFromPaste(body.text, userId, null)
    await updateIngestionSource(source.id, userId, { status: 'done', extractedPartial: partial })
    return NextResponse.json({ source: { ...source, status: 'done', extractedPartial: partial } })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    await updateIngestionSource(source.id, userId, { status: 'failed', errorMsg: msg })
    return NextResponse.json({ error: msg }, { status: 422 })
  }
}
```

- [ ] **Step 6: Write the route test**

```typescript
// app/api/ingest/paste/route.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/auth',                   () => ({ auth: vi.fn() }))
vi.mock('@/lib/ingest/db',              () => ({
  createIngestionSource: vi.fn(),
  updateIngestionSource: vi.fn(),
}))
vi.mock('@/lib/ingest/extract-paste',   () => ({ extractFromPaste: vi.fn() }))

import { auth }                         from '@/lib/auth'
import { createIngestionSource, updateIngestionSource } from '@/lib/ingest/db'
import { extractFromPaste }             from '@/lib/ingest/extract-paste'
import { POST }                         from './route'

beforeEach(() => vi.clearAllMocks())

it('returns 401 when not authenticated', async () => {
  vi.mocked(auth).mockResolvedValueOnce(null as never)
  const res = await POST(new Request('http://localhost', {
    method: 'POST', body: JSON.stringify({ text: 'hello' }),
  }))
  expect(res.status).toBe(401)
})

it('returns source with done status on success', async () => {
  vi.mocked(auth).mockResolvedValueOnce({ user: { id: 'u1' } } as never)
  vi.mocked(createIngestionSource).mockResolvedValueOnce({ id: 's1', status: 'pending' } as never)
  vi.mocked(extractFromPaste).mockResolvedValueOnce({ contact: { name: 'Jane' } } as never)
  vi.mocked(updateIngestionSource).mockResolvedValue(undefined)

  const res = await POST(new Request('http://localhost', {
    method: 'POST',
    body: JSON.stringify({ text: 'Jane Doe, Engineer at Acme Corp. Built many production systems.' }),
  }))
  const json = await res.json() as { source: { status: string } }
  expect(res.status).toBe(200)
  expect(json.source.status).toBe('done')
})

it('returns 422 and failed status when extraction throws', async () => {
  vi.mocked(auth).mockResolvedValueOnce({ user: { id: 'u1' } } as never)
  vi.mocked(createIngestionSource).mockResolvedValueOnce({ id: 's1' } as never)
  vi.mocked(extractFromPaste).mockRejectedValueOnce(new Error('AI failed'))
  vi.mocked(updateIngestionSource).mockResolvedValue(undefined)

  const res = await POST(new Request('http://localhost', {
    method: 'POST',
    body: JSON.stringify({ text: 'some text that is long enough to pass the minimum check' }),
  }))
  expect(res.status).toBe(422)
})
```

- [ ] **Step 7: Run both tests**

```bash
npx vitest run lib/ingest/extract-paste.test.ts app/api/ingest/paste/route.test.ts
```

Expected: all PASS.

- [ ] **Step 8: Commit**

```bash
git add lib/ingest/extract-paste.ts lib/ingest/extract-paste.test.ts \
        app/api/ingest/paste/route.ts app/api/ingest/paste/route.test.ts
git commit -m "feat(ingest): extract-paste lib + route"
```

---

## Task 5: Extract-GitHub lib + route

**Files:**
- Create: `lib/ingest/extract-github.ts`
- Create: `lib/ingest/extract-github.test.ts`
- Create: `app/api/ingest/github/route.ts`

- [ ] **Step 1: Write failing lib test**

```typescript
// lib/ingest/extract-github.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('ai', () => ({ generateText: vi.fn(), jsonSchema: (s: unknown) => s }))
vi.mock('../ai-client',     () => ({ getModel: vi.fn().mockReturnValue('mock-model') }))
vi.mock('../user-settings', () => ({ getActiveConfig: vi.fn().mockResolvedValue({ provider: 'anthropic', model: 'claude-sonnet-4-6' }) }))
vi.mock('../ai-usage',      () => ({ logAiUsage: vi.fn() }))

import { generateText } from 'ai'
import { extractFromGithub, parseGithubInput } from './extract-github'

beforeEach(() => vi.clearAllMocks())

describe('parseGithubInput', () => {
  it('detects profile URL', () =>
    expect(parseGithubInput('https://github.com/janedoe')).toEqual({ kind: 'profile', username: 'janedoe' }))
  it('detects repo URL', () =>
    expect(parseGithubInput('https://github.com/janedoe/my-repo')).toEqual({ kind: 'repo', username: 'janedoe', repo: 'my-repo' }))
  it('detects bare username', () =>
    expect(parseGithubInput('janedoe')).toEqual({ kind: 'profile', username: 'janedoe' }))
  it('throws on input with spaces', () =>
    expect(() => parseGithubInput('not valid input')).toThrow('Invalid GitHub input'))
})

describe('extractFromGithub', () => {
  it('calls AI with github data and returns sparse profile', async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ login: 'janedoe', name: 'Jane Doe', bio: 'Engineer', location: 'NYC' }) })
      .mockResolvedValueOnce({ ok: false })   // profile README — 404 is OK
      .mockResolvedValueOnce({ ok: true, json: async () => [
        { name: 'my-api', description: 'REST API', language: 'Go', topics: ['api'] },
      ]})
      .mockResolvedValue({ ok: false })        // repo READMEs — 404 is OK

    vi.mocked(generateText).mockResolvedValueOnce({
      toolCalls: [{ toolName: 'extract_profile', args: {
        contact:  { name: 'Jane Doe', github: 'https://github.com/janedoe' },
        projects: [{ id: 'my-api', name: 'my-api', short_stack: 'Go', bullets: ['Built REST API serving 10k requests/day using Go and PostgreSQL'] }],
      }}],
      text: '', finishReason: 'tool-calls',
      usage: { inputTokens: 200, outputTokens: 80, totalTokens: 280 },
    } as never)

    const result = await extractFromGithub('https://github.com/janedoe', 'user-1')
    expect(result.contact?.name).toBe('Jane Doe')
    expect(result.projects).toHaveLength(1)
    expect(result.projects![0].id).toBe('my-api')
  })
})
```

- [ ] **Step 2: Run to verify fails**

```bash
npx vitest run lib/ingest/extract-github.test.ts
```

- [ ] **Step 3: Implement `lib/ingest/extract-github.ts`**

```typescript
// lib/ingest/extract-github.ts
import { generateText, jsonSchema } from 'ai'
import { getModel }        from '../ai-client'
import { getActiveConfig } from '../user-settings'
import { logAiUsage }      from '../ai-usage'
import type { SparseProfile } from './types'

const GH_API = 'https://api.github.com'
const GH_HEADERS = {
  'Accept':               'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  'User-Agent':           'ResumeLoop-Ingest/1.0',
}

export type GithubParsed =
  | { kind: 'profile'; username: string }
  | { kind: 'repo';    username: string; repo: string }

export function parseGithubInput(input: string): GithubParsed {
  const trimmed = input.trim()
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    const url = new URL(trimmed)
    if (url.hostname !== 'github.com') throw new Error('Invalid GitHub input: not a github.com URL')
    const parts = url.pathname.replace(/^\//, '').split('/').filter(Boolean)
    if (parts.length === 1) return { kind: 'profile', username: parts[0] }
    if (parts.length >= 2) return { kind: 'repo', username: parts[0], repo: parts[1] }
    throw new Error('Invalid GitHub input: no username in URL')
  }
  if (/^[a-zA-Z0-9]([a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?$/.test(trimmed))
    return { kind: 'profile', username: trimmed }
  throw new Error('Invalid GitHub input: expected github.com URL or bare username')
}

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { headers: GH_HEADERS })
    if (!res.ok) return null
    return res.json() as Promise<T>
  } catch { return null }
}

async function fetchReadme(username: string, repo: string): Promise<string | null> {
  const data = await fetchJson<{ content: string; encoding: string }>(
    `${GH_API}/repos/${username}/${repo}/readme`,
  )
  if (!data) return null
  try {
    return Buffer.from(data.content, data.encoding as BufferEncoding).toString('utf8').slice(0, 3000)
  } catch { return null }
}

const SYSTEM_PROMPT = `You extract professional profile data from GitHub profile information.
Focus on projects[] from repositories and narrative from bio/README.
Do NOT invent experience[] from GitHub — work history is not reliably inferable from repos.
IDs: lowercase slug matching the repo name. Bullets: action-verb phrases 116 chars max, 2-4 per project.
short_stack: 3-4 key technologies, 40 chars max.`

export async function extractFromGithub(input: string, userId: string): Promise<SparseProfile> {
  const parsed   = parseGithubInput(input)
  const username = parsed.username

  type GhUser = { name?: string; bio?: string; location?: string; company?: string }
  const profile = await fetchJson<GhUser>(`${GH_API}/users/${username}`)
  if (!profile) throw new Error(`GitHub user "${username}" not found or API rate-limited`)

  const profileReadme = await fetchReadme(username, username)

  type GhRepo = { name: string; description?: string; language?: string; topics?: string[] }
  let repos: GhRepo[] = []
  if (parsed.kind === 'profile') {
    repos = (await fetchJson<GhRepo[]>(`${GH_API}/users/${username}/repos?sort=updated&per_page=6`)) ?? []
  } else {
    const single = await fetchJson<GhRepo>(`${GH_API}/repos/${username}/${parsed.repo}`)
    if (single) repos = [single]
  }

  const reposWithReadme = await Promise.all(
    repos.map(async r => ({
      ...r,
      readmeExcerpt: (await fetchReadme(username, r.name))?.slice(0, 1500) ?? '',
    }))
  )

  const githubContent = [
    `GitHub username: ${username}`,
    profile.name     ? `Name: ${profile.name}`         : '',
    profile.bio      ? `Bio: ${profile.bio}`            : '',
    profile.location ? `Location: ${profile.location}`  : '',
    profileReadme    ? `\nProfile README:\n${profileReadme}` : '',
    '\nTop repositories:',
    ...reposWithReadme.map(r =>
      `- ${r.name}${r.description ? ': ' + r.description : ''}` +
      (r.language ? ` [${r.language}]` : '') +
      (r.readmeExcerpt ? `\n  README: ${r.readmeExcerpt}` : '')
    ),
  ].filter(Boolean).join('\n')

  const cfg = await getActiveConfig(userId)
  if (!cfg) throw new Error('No AI provider configured. Go to Settings → AI to add an API key.')

  const result = await generateText({
    model:    getModel(cfg),
    system:   SYSTEM_PROMPT,
    messages: [{ role: 'user', content: githubContent }],
    tools: {
      extract_profile: {
        description: 'Extract profile data from the provided GitHub information',
        parameters:  jsonSchema<SparseProfile>({
          type: 'object',
          properties: {
            contact: {
              type: 'object',
              properties: {
                name: { type: 'string' }, location: { type: 'string' },
                github: { type: 'string' }, website: { type: 'string' },
              },
            },
            projects: {
              type: 'array',
              items: {
                type: 'object', required: ['id'],
                properties: {
                  id: { type: 'string' }, name: { type: 'string' }, url: { type: 'string' },
                  short_stack: { type: 'string', maxLength: 40 }, dates: { type: 'string' },
                  bullets: { type: 'array', items: { type: 'string', maxLength: 116 }, maxItems: 4 },
                },
              },
            },
            candidate_profile: {
              type: 'object',
              properties: { narrative: { type: 'string' } },
            },
          },
        }),
      },
    },
    toolChoice: 'required',
    maxTokens:  2000,
  })

  const call = result.toolCalls.find(t => t.toolName === 'extract_profile')
  if (!call) throw new Error('AI did not call extract_profile tool')

  await logAiUsage(userId, cfg.provider, cfg.model, 'ingest-github',
    result.usage?.inputTokens ?? 0, result.usage?.outputTokens ?? 0)

  return call.args as SparseProfile
}
```

- [ ] **Step 4: Run to verify passes**

```bash
npx vitest run lib/ingest/extract-github.test.ts
```

Expected: all PASS.

- [ ] **Step 5: Write the route**

```typescript
// app/api/ingest/github/route.ts
import { NextResponse }  from 'next/server'
import { auth }          from '@/lib/auth'
import { createIngestionSource, updateIngestionSource } from '@/lib/ingest/db'
import { extractFromGithub, parseGithubInput } from '@/lib/ingest/extract-github'

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = session.user.id

  const body = await req.json() as { input?: string }
  if (!body.input?.trim()) return NextResponse.json({ error: 'input required' }, { status: 400 })

  try {
    parseGithubInput(body.input)  // validate before creating DB row
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 400 })
  }

  const source = await createIngestionSource(userId, 'github', body.input)

  try {
    await updateIngestionSource(source.id, userId, { status: 'processing' })
    const partial = await extractFromGithub(body.input, userId)
    await updateIngestionSource(source.id, userId, { status: 'done', extractedPartial: partial })
    return NextResponse.json({ source: { ...source, status: 'done', extractedPartial: partial } })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    await updateIngestionSource(source.id, userId, { status: 'failed', errorMsg: msg })
    return NextResponse.json({ error: msg }, { status: 422 })
  }
}
```

- [ ] **Step 6: Run all ingest lib tests**

```bash
npx vitest run lib/ingest/
```

Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add lib/ingest/extract-github.ts lib/ingest/extract-github.test.ts \
        app/api/ingest/github/route.ts
git commit -m "feat(ingest): extract-github lib + route"
```

---

## Task 6: Extract-URL lib + route

**Files:**
- Create: `lib/ingest/extract-url.ts`
- Create: `lib/ingest/extract-url.test.ts`
- Create: `app/api/ingest/url/route.ts`

- [ ] **Step 1: Write failing lib test**

```typescript
// lib/ingest/extract-url.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('ai', () => ({ generateText: vi.fn(), jsonSchema: (s: unknown) => s }))
vi.mock('../ai-client',     () => ({ getModel: vi.fn().mockReturnValue('mock-model') }))
vi.mock('../user-settings', () => ({ getActiveConfig: vi.fn().mockResolvedValue({ provider: 'anthropic', model: 'claude-sonnet-4-6' }) }))
vi.mock('../ai-usage',      () => ({ logAiUsage: vi.fn() }))
vi.mock('../db-adapter', () => ({
  getAdapter: vi.fn().mockResolvedValue({
    queryOne: vi.fn().mockResolvedValue(null),  // no firecrawl key stored
  }),
}))

import { generateText } from 'ai'
import { scrapeUrl, extractFromUrl } from './extract-url'

beforeEach(() => vi.clearAllMocks())

describe('scrapeUrl', () => {
  it('strips HTML when no Firecrawl key', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok:   true,
      text: async () => '<html><body><h1>Jane Doe</h1><p>Software Engineer</p></body></html>',
    } as never)
    const md = await scrapeUrl('https://janedoe.com', null)
    expect(md).toContain('Jane Doe')
    expect(md).not.toContain('<h1>')
  })
})

describe('extractFromUrl', () => {
  it('returns sparse profile from scraped content', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      text: async () => '<html><body>Jane Doe, Engineer. Built distributed systems at Acme Corp.</body></html>',
    } as never)

    vi.mocked(generateText).mockResolvedValueOnce({
      toolCalls: [{ toolName: 'extract_profile', args: {
        contact:    { name: 'Jane Doe', website: 'https://janedoe.com' },
        experience: [{ id: 'acme', company: 'Acme Corp', title: 'Engineer',
                       bullets: { genai: ['Built distributed systems using Go and Kubernetes'] } }],
      }}],
      text: '', finishReason: 'tool-calls',
      usage: { inputTokens: 300, outputTokens: 100, totalTokens: 400 },
    } as never)

    const result = await extractFromUrl('https://janedoe.com', 'user-1')
    expect(result.contact?.name).toBe('Jane Doe')
    expect(result.experience![0].id).toBe('acme')
  })
})
```

- [ ] **Step 2: Run to verify fails**

```bash
npx vitest run lib/ingest/extract-url.test.ts
```

- [ ] **Step 3: Implement `lib/ingest/extract-url.ts`**

```typescript
// lib/ingest/extract-url.ts
import { generateText, jsonSchema } from 'ai'
import { getModel }        from '../ai-client'
import { getActiveConfig } from '../user-settings'
import { logAiUsage }      from '../ai-usage'
import { getAdapter }      from '../db-adapter'
import type { SparseProfile } from './types'

export async function getFirecrawlKey(userId: string): Promise<string | null> {
  const db  = await getAdapter()
  const row = await db.queryOne<{ value: string }>(
    `SELECT value FROM app_settings WHERE key = ?`, [`firecrawl_key:${userId}`],
  )
  return row?.value?.trim() || null
}

export async function scrapeUrl(url: string, firecrawlKey: string | null): Promise<string> {
  if (firecrawlKey) {
    try {
      const { default: FirecrawlApp } = await import('@mendable/firecrawl-js') as {
        default: new (opts: { apiKey: string }) => {
          scrapeUrl: (url: string, opts: object) => Promise<{ success: boolean; markdown?: string; error?: string }>
        }
      }
      const app = new FirecrawlApp({ apiKey: firecrawlKey })
      const res = await app.scrapeUrl(url, { formats: ['markdown'] })
      if (res.success && res.markdown) return res.markdown.slice(0, 30_000)
      console.warn('[ingest-url] Firecrawl failed:', res.error, '— falling back to fetch')
    } catch (e) {
      console.warn('[ingest-url] Firecrawl error:', e, '— falling back to fetch')
    }
  }

  const resp = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ResumeLoop/1.0)' },
    signal:  AbortSignal.timeout(15_000),
  })
  if (!resp.ok) throw new Error(`Failed to fetch URL: HTTP ${resp.status}`)
  const html = await resp.text()
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 20_000)
}

const SYSTEM_PROMPT = `You extract professional profile data from a scraped webpage.
The page may be a personal website, portfolio, company page, or online resume.
Extract all clearly stated professional information — never guess or infer.
IDs: lowercase slug. Bullet text: action-verb phrases 116 chars max.
short_stack: 3-4 key technologies, 40 chars max.`

export async function extractFromUrl(url: string, userId: string): Promise<SparseProfile> {
  const firecrawlKey = await getFirecrawlKey(userId)
  const pageContent  = await scrapeUrl(url, firecrawlKey)

  const cfg = await getActiveConfig(userId)
  if (!cfg) throw new Error('No AI provider configured. Go to Settings → AI to add an API key.')

  const result = await generateText({
    model:    getModel(cfg),
    system:   SYSTEM_PROMPT,
    messages: [{ role: 'user', content: `URL: ${url}\n\nPage content:\n\n${pageContent}` }],
    tools: {
      extract_profile: {
        description: 'Extract professional profile data from the scraped page',
        parameters:  jsonSchema<SparseProfile>({
          type: 'object',
          properties: {
            contact: {
              type: 'object',
              properties: {
                name: { type: 'string' }, email: { type: 'string' },
                phone: { type: 'string' }, location: { type: 'string' },
                linkedin: { type: 'string' }, github: { type: 'string' }, website: { type: 'string' },
              },
            },
            experience: {
              type: 'array',
              items: {
                type: 'object', required: ['id'],
                properties: {
                  id: { type: 'string' }, title: { type: 'string' }, company: { type: 'string' },
                  location: { type: 'string' }, dates: { type: 'string' },
                  bullets: { type: 'object', required: ['genai'],
                    properties: { genai: { type: 'array', items: { type: 'string', maxLength: 116 }, maxItems: 6 } } },
                },
              },
            },
            projects: {
              type: 'array',
              items: {
                type: 'object', required: ['id'],
                properties: {
                  id: { type: 'string' }, name: { type: 'string' }, url: { type: 'string' },
                  short_stack: { type: 'string', maxLength: 40 }, dates: { type: 'string' },
                  bullets: { type: 'array', items: { type: 'string', maxLength: 116 }, maxItems: 6 },
                },
              },
            },
            skills: {
              type: 'object',
              properties: { genai: { type: 'object', additionalProperties: { type: 'string' } } },
            },
            candidate_profile: {
              type: 'object',
              properties: { narrative: { type: 'string' } },
            },
          },
        }),
      },
    },
    toolChoice: 'required',
    maxTokens:  2500,
  })

  const call = result.toolCalls.find(t => t.toolName === 'extract_profile')
  if (!call) throw new Error('AI did not call extract_profile tool')

  await logAiUsage(userId, cfg.provider, cfg.model, 'ingest-url',
    result.usage?.inputTokens ?? 0, result.usage?.outputTokens ?? 0)

  return call.args as SparseProfile
}
```

- [ ] **Step 4: Write the route**

```typescript
// app/api/ingest/url/route.ts
import { NextResponse }   from 'next/server'
import { auth }           from '@/lib/auth'
import { createIngestionSource, updateIngestionSource } from '@/lib/ingest/db'
import { extractFromUrl } from '@/lib/ingest/extract-url'

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = session.user.id

  const body = await req.json() as { url?: string }
  if (!body.url?.trim()) return NextResponse.json({ error: 'url required' }, { status: 400 })

  let validUrl: string
  try { validUrl = new URL(body.url).toString() }
  catch { return NextResponse.json({ error: 'Invalid URL' }, { status: 400 }) }

  const source = await createIngestionSource(userId, 'url', validUrl)

  try {
    await updateIngestionSource(source.id, userId, { status: 'processing' })
    const partial = await extractFromUrl(validUrl, userId)
    await updateIngestionSource(source.id, userId, { status: 'done', extractedPartial: partial })
    return NextResponse.json({ source: { ...source, status: 'done', extractedPartial: partial } })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    await updateIngestionSource(source.id, userId, { status: 'failed', errorMsg: msg })
    return NextResponse.json({ error: msg }, { status: 422 })
  }
}
```

- [ ] **Step 5: Run all lib/ingest tests**

```bash
npx vitest run lib/ingest/
```

Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/ingest/extract-url.ts lib/ingest/extract-url.test.ts \
        app/api/ingest/url/route.ts
git commit -m "feat(ingest): extract-url lib + route (Firecrawl + fetch fallback)"
```

---

## Task 7: Merge lib + route

**Files:**
- Create: `lib/ingest/merge.ts`
- Create: `lib/ingest/merge.test.ts`
- Create: `app/api/ingest/merge/route.ts`

- [ ] **Step 1: Write failing lib test**

```typescript
// lib/ingest/merge.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('ai', () => ({ generateText: vi.fn(), jsonSchema: (s: unknown) => s }))
vi.mock('../ai-client',     () => ({ getModel: vi.fn().mockReturnValue('mock-model') }))
vi.mock('../user-settings', () => ({ getActiveConfig: vi.fn().mockResolvedValue({ provider: 'anthropic', model: 'claude-sonnet-4-6' }) }))
vi.mock('../ai-usage',      () => ({ logAiUsage: vi.fn() }))

import { generateText } from 'ai'
import { mergePartials } from './merge'
import type { SparseProfile, IngestionSource } from './types'

beforeEach(() => vi.clearAllMocks())

const makeSrc = (id: string, partial: SparseProfile): IngestionSource => ({
  id, userId: 'u1', type: 'paste', inputRaw: '', status: 'done',
  extractedPartial: partial, errorMsg: null, createdAt: 0,
})

describe('mergePartials', () => {
  it('returns merged profile and empty conflicts', async () => {
    vi.mocked(generateText).mockResolvedValueOnce({
      toolCalls: [{ toolName: 'merge_profiles', args: {
        merged: {
          contact:  { name: 'Jane Doe', email: 'jane@example.com' },
          projects: [{ id: 'my-api', name: 'my-api', short_stack: 'Go', bullets: ['Built REST API'] }],
        },
        conflicts: [],
      }}],
      text: '', finishReason: 'tool-calls',
      usage: { inputTokens: 500, outputTokens: 200, totalTokens: 700 },
    } as never)

    const result = await mergePartials([
      makeSrc('s1', { contact: { name: 'Jane Doe', email: 'jane@example.com' } }),
      makeSrc('s2', { projects: [{ id: 'my-api', name: 'my-api', short_stack: 'Go', bullets: ['Built REST API'] }] }),
    ], 'u1')

    expect(result.profile.contact?.name).toBe('Jane Doe')
    expect(result.profile.projects).toHaveLength(1)
    expect(result.conflicts).toHaveLength(0)
  })

  it('surfaces conflicts when AI reports them', async () => {
    vi.mocked(generateText).mockResolvedValueOnce({
      toolCalls: [{ toolName: 'merge_profiles', args: {
        merged:    { contact: { name: 'Jane Doe' } },
        conflicts: [{
          field: 'contact.name',
          description: 'Source 1 says "Jane Doe", source 2 says "J. Doe"',
          sources: [
            { sourceId: 's1', sourceType: 'paste', value: 'Jane Doe' },
            { sourceId: 's2', sourceType: 'url',   value: 'J. Doe' },
          ],
        }],
      }}],
      text: '', finishReason: 'tool-calls',
      usage: { inputTokens: 400, outputTokens: 150, totalTokens: 550 },
    } as never)

    const result = await mergePartials([
      makeSrc('s1', { contact: { name: 'Jane Doe' } }),
      makeSrc('s2', { contact: { name: 'J. Doe' } }),
    ], 'u1')

    expect(result.conflicts).toHaveLength(1)
    expect(result.conflicts[0].field).toBe('contact.name')
  })

  it('skips AI call and returns directly when only one source', async () => {
    const partial: SparseProfile = { contact: { name: 'Solo' } }
    const result = await mergePartials([makeSrc('s1', partial)], 'u1')
    expect(result.profile).toEqual(partial)
    expect(generateText).not.toHaveBeenCalled()
  })

  it('throws when called with zero done sources', async () => {
    await expect(mergePartials([], 'u1')).rejects.toThrow('No extracted sources')
  })
})
```

- [ ] **Step 2: Run to verify fails**

```bash
npx vitest run lib/ingest/merge.test.ts
```

- [ ] **Step 3: Implement `lib/ingest/merge.ts`**

```typescript
// lib/ingest/merge.ts
import { generateText, jsonSchema } from 'ai'
import { getModel }        from '../ai-client'
import { getActiveConfig } from '../user-settings'
import { logAiUsage }      from '../ai-usage'
import type { SparseProfile, IngestionSource, MergeResult, ConflictEntry } from './types'

const SYSTEM_PROMPT = `You merge multiple partial resume profiles into one complete profile.
Rules:
- Most-specific-wins: prefer the most detailed/concrete value for each scalar field
- Additive for arrays: keep all unique experience[] and projects[] entries, deduped by id
- When two sources give genuinely different values for the same field, add a ConflictEntry
- Never invent data not present in any source`

interface MergeToolOutput {
  merged:    SparseProfile
  conflicts: ConflictEntry[]
}

export async function mergePartials(
  sources:  IngestionSource[],
  userId:   string,
): Promise<MergeResult> {
  const done = sources.filter(s => s.status === 'done' && s.extractedPartial)
  if (done.length === 0) throw new Error('No extracted sources to merge')
  if (done.length === 1) return { profile: done[0].extractedPartial!, conflicts: [] }

  const partialsText = done.map((s, i) =>
    `Source ${i + 1} (id: ${s.id}, type: ${s.type}):\n${JSON.stringify(s.extractedPartial, null, 2)}`
  ).join('\n\n---\n\n')

  const cfg = await getActiveConfig(userId)
  if (!cfg) throw new Error('No AI provider configured. Go to Settings → AI to add an API key.')

  const result = await generateText({
    model:    getModel(cfg),
    system:   SYSTEM_PROMPT,
    messages: [{ role: 'user', content: `Merge these profile partials:\n\n${partialsText}` }],
    tools: {
      merge_profiles: {
        description: 'Produce a merged profile and list any conflicts',
        parameters:  jsonSchema<MergeToolOutput>({
          type: 'object', required: ['merged', 'conflicts'],
          properties: {
            merged: {
              type: 'object',
              properties: {
                contact: {
                  type: 'object',
                  properties: {
                    name: { type: 'string' }, email: { type: 'string' },
                    phone: { type: 'string' }, location: { type: 'string' },
                    linkedin: { type: 'string' }, github: { type: 'string' }, website: { type: 'string' },
                  },
                },
                experience: {
                  type: 'array',
                  items: {
                    type: 'object', required: ['id'],
                    properties: {
                      id: { type: 'string' }, title: { type: 'string' }, company: { type: 'string' },
                      location: { type: 'string' }, dates: { type: 'string' },
                      bullets: { type: 'object', properties: {
                        genai: { type: 'array', items: { type: 'string', maxLength: 116 } },
                      }},
                    },
                  },
                },
                projects: {
                  type: 'array',
                  items: {
                    type: 'object', required: ['id'],
                    properties: {
                      id: { type: 'string' }, name: { type: 'string' }, url: { type: 'string' },
                      short_stack: { type: 'string', maxLength: 40 }, dates: { type: 'string' },
                      bullets: { type: 'array', items: { type: 'string', maxLength: 116 } },
                    },
                  },
                },
                skills: {
                  type: 'object',
                  properties: { genai: { type: 'object', additionalProperties: { type: 'string' } } },
                },
                candidate_profile: {
                  type: 'object',
                  properties: { narrative: { type: 'string' } },
                },
              },
            },
            conflicts: {
              type: 'array',
              items: {
                type: 'object', required: ['field', 'description', 'sources'],
                properties: {
                  field: { type: 'string' }, description: { type: 'string' },
                  sources: { type: 'array', items: {
                    type: 'object',
                    properties: {
                      sourceId:   { type: 'string' },
                      sourceType: { type: 'string' },
                      value:      {},
                    },
                  }},
                },
              },
            },
          },
        }),
      },
    },
    toolChoice: 'required',
    maxTokens:  3000,
  })

  const call = result.toolCalls.find(t => t.toolName === 'merge_profiles')
  if (!call) throw new Error('AI did not call merge_profiles tool')

  await logAiUsage(userId, cfg.provider, cfg.model, 'ingest-merge',
    result.usage?.inputTokens ?? 0, result.usage?.outputTokens ?? 0)

  const { merged, conflicts } = call.args as MergeToolOutput
  return { profile: merged, conflicts }
}
```

- [ ] **Step 4: Write the merge route**

```typescript
// app/api/ingest/merge/route.ts
import { NextResponse }          from 'next/server'
import { auth }                  from '@/lib/auth'
import { listIngestionSources }  from '@/lib/ingest/db'
import { mergePartials }         from '@/lib/ingest/merge'

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = session.user.id

  const sources     = await listIngestionSources(userId)
  const doneSources = sources.filter(s => s.status === 'done')

  if (doneSources.length === 0)
    return NextResponse.json({ error: 'No completed sources to merge' }, { status: 422 })

  try {
    const mergeResult = await mergePartials(doneSources, userId)
    return NextResponse.json(mergeResult)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 422 })
  }
}
```

- [ ] **Step 5: Run all lib/ingest tests**

```bash
npx vitest run lib/ingest/
```

Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/ingest/merge.ts lib/ingest/merge.test.ts \
        app/api/ingest/merge/route.ts
git commit -m "feat(ingest): merge lib + route (most-specific-wins, conflict flagging)"
```

---

## Task 8: Sources management route + remove demo seed

**Files:**
- Create: `app/api/ingest/sources/route.ts`
- Modify: `app/api/profiles/route.ts`

- [ ] **Step 1: Write the sources management route**

```typescript
// app/api/ingest/sources/route.ts
import { NextResponse }    from 'next/server'
import { auth }            from '@/lib/auth'
import { listIngestionSources, deleteIngestionSource } from '@/lib/ingest/db'

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const sources = await listIngestionSources(session.user.id)
  return NextResponse.json({ sources })
}

export async function DELETE(req: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const id = new URL(req.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const deleted = await deleteIngestionSource(id, session.user.id)
  if (!deleted) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 2: Find and remove demo seed in profiles POST handler**

```bash
grep -n "master_resume_data\|demo\|DEMO\|seed\|masterData\|PATHS.pipeline" \
  /Users/vietquocbui/repos/ResumeLoop/app/api/profiles/route.ts
```

Find the block that reads from `master_resume_data.json` or falls back to demo data when creating a new profile with no `data` or `fork_from`. Replace the seed value with an empty profile:

```typescript
// Before (something like):
// const seedData = fs.existsSync(PATHS.pipeline.masterData)
//   ? fs.readFileSync(PATHS.pipeline.masterData, 'utf8')
//   : JSON.stringify(DEMO_PROFILE_DATA)

// After:
const seedData = JSON.stringify({ experience: [], projects: [], skills: {} })
```

Keep the `fork_from` logic unchanged — that copies an existing profile, not the seed.

- [ ] **Step 3: Verify type-check**

```bash
npx tsc --noEmit 2>&1 | grep "profiles/route\|ingest/sources" | head -10
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add app/api/ingest/sources/route.ts app/api/profiles/route.ts
git commit -m "feat(ingest): sources GET/DELETE route + remove demo seed from new-user path"
```

---

## Task 9: Onboarding gate + SmartInput

**Files:**
- Create: `components/OnboardingGate.tsx`
- Modify: `app/(app)/layout.tsx`
- Create: `components/onboarding/SmartInput.tsx`

- [ ] **Step 1: Create `components/OnboardingGate.tsx`**

```typescript
// components/OnboardingGate.tsx
'use client'
import { useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'

export function OnboardingGate({ children }: { children: React.ReactNode }) {
  const router   = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    if (pathname.startsWith('/onboarding') || pathname.startsWith('/auth')) return

    fetch('/api/profiles')
      .then(r => r.json())
      .then((data: { profiles?: Array<{ id: string }> }) => {
        if (!data.profiles || data.profiles.length === 0) {
          router.replace('/onboarding')
        }
      })
      .catch(() => { /* silently ignore — don't block the app on fetch failure */ })
  }, [pathname, router])

  return <>{children}</>
}
```

- [ ] **Step 2: Wrap app layout**

In `app/(app)/layout.tsx`, import and wrap children:

```typescript
import { OnboardingGate } from '@/components/OnboardingGate'

// Inside the layout JSX, wrap {children}:
<OnboardingGate>
  {children}
</OnboardingGate>
```

- [ ] **Step 3: Create `components/onboarding/SmartInput.tsx`**

```typescript
// components/onboarding/SmartInput.tsx
'use client'
import { useState } from 'react'

export type DetectedType = 'github' | 'url' | 'paste' | null

export function detectInputType(input: string): DetectedType {
  const t = input.trim()
  if (!t) return null
  if (t.startsWith('http://') || t.startsWith('https://')) {
    try {
      const url = new URL(t)
      return url.hostname === 'github.com' ? 'github' : 'url'
    } catch { return 'url' }
  }
  // Bare GitHub username: 1-39 chars, letters/digits/hyphens, no consecutive hyphens
  if (/^[a-zA-Z0-9]([a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?$/.test(t)) return 'github'
  return 'paste'
}

const LABEL: Record<Exclude<DetectedType, null>, string> = {
  github: 'Extract GitHub profile',
  url:    'Scrape this page',
  paste:  'Extract from text',
}

const ENDPOINT: Record<Exclude<DetectedType, null>, string> = {
  github: '/api/ingest/github',
  url:    '/api/ingest/url',
  paste:  '/api/ingest/paste',
}

const PAYLOAD_KEY: Record<Exclude<DetectedType, null>, string> = {
  github: 'input',
  url:    'url',
  paste:  'text',
}

export function SmartInput({ onSourceAdded }: { onSourceAdded: (source: unknown) => void }) {
  const [value,   setValue]   = useState('')
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState<string | null>(null)

  const detected = detectInputType(value)

  const handleSubmit = async () => {
    if (!detected) return
    setLoading(true); setError(null)
    try {
      const res  = await fetch(ENDPOINT[detected], {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body:   JSON.stringify({ [PAYLOAD_KEY[detected]]: value.trim() }),
      })
      const data = await res.json() as { source?: unknown; error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Extraction failed')
      onSourceAdded(data.source)
      setValue('')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-2">
      <textarea
        value={value}
        onChange={e => { setValue(e.target.value); setError(null) }}
        placeholder="Paste a URL, GitHub profile (github.com/username or just username), or any text — LinkedIn About, bio, resume…"
        className="w-full h-28 bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-sm text-zinc-200 placeholder-zinc-500 resize-none focus:outline-none focus:ring-1 focus:ring-indigo-500"
        disabled={loading}
      />
      {detected && (
        <div className="flex items-center gap-3">
          <span className="text-xs text-zinc-400">
            Detected: <span className="text-indigo-400 font-medium">{detected}</span>
          </span>
          <button
            onClick={handleSubmit} disabled={loading}
            className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm rounded-md transition-colors"
          >
            {loading ? 'Extracting…' : LABEL[detected]}
          </button>
        </div>
      )}
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  )
}
```

- [ ] **Step 4: Run type-check**

```bash
npx tsc --noEmit 2>&1 | grep "OnboardingGate\|SmartInput" | head -10
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add components/OnboardingGate.tsx app/\(app\)/layout.tsx \
        components/onboarding/SmartInput.tsx
git commit -m "feat(ingest): onboarding gate + SmartInput component"
```

---

## Task 10: SourceCard + SourceBoard

**Files:**
- Create: `components/onboarding/SourceCard.tsx`
- Create: `components/onboarding/SourceBoard.tsx`

- [ ] **Step 1: Create `SourceCard`**

```typescript
// components/onboarding/SourceCard.tsx
'use client'
import type { IngestionSource } from '@/lib/ingest/types'

const STATUS_RING: Record<IngestionSource['status'], string> = {
  pending:    'border-zinc-700',
  processing: 'border-amber-600 animate-pulse',
  done:       'border-green-700',
  failed:     'border-red-800',
}

const STATUS_TEXT: Record<IngestionSource['status'], string> = {
  pending: 'Pending', processing: 'Extracting…', done: 'Done', failed: 'Failed',
}

const TYPE_LABEL: Record<IngestionSource['type'], string> = {
  url: 'URL', github: 'GitHub', paste: 'Text',
}

function summary(src: IngestionSource): string {
  if (!src.extractedPartial) return ''
  const p = src.extractedPartial
  const parts: string[] = []
  if (p.experience?.length) parts.push(`${p.experience.length} work entr${p.experience.length === 1 ? 'y' : 'ies'}`)
  if (p.projects?.length)   parts.push(`${p.projects.length} project${p.projects.length === 1 ? '' : 's'}`)
  if (p.contact?.name)      parts.push(`name: ${p.contact.name}`)
  return parts.join(' · ') || 'contact info only'
}

export function SourceCard({ source, onDelete }: { source: IngestionSource; onDelete: (id: string) => void }) {
  return (
    <div className={`flex items-start justify-between gap-3 bg-zinc-900 border rounded-lg p-4 ${STATUS_RING[source.status]}`}>
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-indigo-400 uppercase tracking-wide">{TYPE_LABEL[source.type]}</span>
          <span className="text-xs text-zinc-500">{STATUS_TEXT[source.status]}</span>
        </div>
        <p className="text-sm text-zinc-300 truncate">{source.inputRaw}</p>
        {source.status === 'done'   && <p className="text-xs text-zinc-500">{summary(source)}</p>}
        {source.status === 'failed' && source.errorMsg && <p className="text-xs text-red-400">{source.errorMsg}</p>}
      </div>
      <button onClick={() => onDelete(source.id)} className="text-zinc-600 hover:text-zinc-400 text-xs shrink-0" aria-label="Remove source">✕</button>
    </div>
  )
}
```

- [ ] **Step 2: Create `SourceBoard`**

```typescript
// components/onboarding/SourceBoard.tsx
'use client'
import { useState, useCallback } from 'react'
import { SmartInput }            from './SmartInput'
import { SourceCard }            from './SourceCard'
import type { IngestionSource, MergeResult } from '@/lib/ingest/types'

function hasSoftMinimum(sources: IngestionSource[]): boolean {
  return sources.some(s => {
    if (s.status !== 'done' || !s.extractedPartial) return false
    const p = s.extractedPartial
    return (p.experience?.length ?? 0) > 0 || (p.projects?.length ?? 0) > 0
  })
}

export function SourceBoard({ onMergeComplete }: { onMergeComplete: (r: MergeResult) => void }) {
  const [sources, setSources]   = useState<IngestionSource[]>([])
  const [merging, setMerging]   = useState(false)
  const [mergeErr, setMergeErr] = useState<string | null>(null)

  const handleSourceAdded = useCallback((src: unknown) => {
    setSources(prev => [src as IngestionSource, ...prev])
  }, [])

  const handleDelete = useCallback(async (id: string) => {
    await fetch(`/api/ingest/sources?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
    setSources(prev => prev.filter(s => s.id !== id))
  }, [])

  const handleBuild = async () => {
    setMerging(true); setMergeErr(null)
    try {
      const res  = await fetch('/api/ingest/merge', { method: 'POST' })
      const data = await res.json() as MergeResult & { error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Merge failed')
      onMergeComplete(data)
    } catch (e) {
      setMergeErr(e instanceof Error ? e.message : String(e))
    } finally {
      setMerging(false)
    }
  }

  const doneSources = sources.filter(s => s.status === 'done')
  const canBuild    = doneSources.length > 0 && hasSoftMinimum(sources)
  const warnNoMin   = doneSources.length > 0 && !hasSoftMinimum(sources)

  return (
    <div className="space-y-6">
      <SmartInput onSourceAdded={handleSourceAdded} />

      {sources.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-medium text-zinc-400">Sources ({sources.length})</h2>
          {sources.map(s => <SourceCard key={s.id} source={s} onDelete={handleDelete} />)}
        </div>
      )}

      {warnNoMin && (
        <p className="text-xs text-amber-400">
          No work experience or projects found yet — add more sources before building.
        </p>
      )}
      {mergeErr && <p className="text-xs text-red-400">{mergeErr}</p>}

      <button
        onClick={handleBuild} disabled={!canBuild || merging}
        className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-sm font-medium rounded-lg transition-colors"
      >
        {merging ? 'Building profile…' : 'Build profile'}
      </button>
    </div>
  )
}
```

- [ ] **Step 3: Run type-check**

```bash
npx tsc --noEmit 2>&1 | grep "SourceCard\|SourceBoard" | head -10
```

- [ ] **Step 4: Commit**

```bash
git add components/onboarding/SourceCard.tsx components/onboarding/SourceBoard.tsx
git commit -m "feat(ingest): SourceCard + SourceBoard components"
```

---

## Task 11: ProfileReview + ConflictBanner + wire onboarding page

**Files:**
- Create: `components/onboarding/ConflictBanner.tsx`
- Create: `components/onboarding/ProfileReview.tsx`
- Create: `app/(app)/onboarding/page.tsx`

- [ ] **Step 1: Create `ConflictBanner`**

```typescript
// components/onboarding/ConflictBanner.tsx
'use client'
import type { ConflictEntry } from '@/lib/ingest/types'

export function ConflictBanner({ conflicts }: { conflicts: ConflictEntry[] }) {
  if (conflicts.length === 0) return null
  return (
    <div className="bg-amber-950/40 border border-amber-700/50 rounded-lg p-4 space-y-2">
      <p className="text-sm font-medium text-amber-300">
        {conflicts.length} conflict{conflicts.length === 1 ? '' : 's'} found — review before accepting
      </p>
      <ul className="space-y-1">
        {conflicts.map((c, i) => (
          <li key={i} className="text-xs text-amber-200/80">
            <span className="font-mono text-amber-400">{c.field}</span>: {c.description}
          </li>
        ))}
      </ul>
    </div>
  )
}
```

- [ ] **Step 2: Create `ProfileReview`**

```typescript
// components/onboarding/ProfileReview.tsx
'use client'
import { useState }         from 'react'
import type { SparseProfile, ConflictEntry } from '@/lib/ingest/types'
import { ConflictBanner }   from './ConflictBanner'

interface Props {
  profile:   SparseProfile
  conflicts: ConflictEntry[]
  onAccept:  (profile: SparseProfile) => void
  onBack:    () => void
  saving:    boolean
}

export function ProfileReview({ profile, conflicts, onAccept, onBack, saving }: Props) {
  const [local, setLocal] = useState<SparseProfile>(profile)

  const setContact = (key: keyof NonNullable<SparseProfile['contact']>, val: string) =>
    setLocal(p => ({ ...p, contact: { ...p.contact, [key]: val } }))

  return (
    <div className="space-y-6">
      <ConflictBanner conflicts={conflicts} />

      <section className="space-y-3">
        <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">Contact</h2>
        <div className="grid grid-cols-2 gap-3">
          {(['name', 'email', 'location', 'linkedin', 'github', 'website'] as const).map(f => (
            <div key={f} className="space-y-1">
              <label className="text-xs text-zinc-500 capitalize">{f}</label>
              <input
                value={local.contact?.[f] ?? ''}
                onChange={e => setContact(f, e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
          ))}
        </div>
      </section>

      {(local.experience ?? []).length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">
            Work Experience ({local.experience!.length})
          </h2>
          {local.experience!.map(exp => (
            <div key={exp.id} className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 space-y-2">
              <div className="flex gap-2 flex-wrap text-sm">
                <span className="font-medium text-zinc-200">{exp.title ?? '—'}</span>
                <span className="text-zinc-400">@ {exp.company ?? '—'}</span>
                {exp.dates && <span className="text-xs text-zinc-500 self-center">{exp.dates}</span>}
              </div>
              {(exp.bullets?.genai ?? []).map((b, i) => (
                <p key={i} className="text-xs text-zinc-400 pl-2 border-l border-zinc-700">{b}</p>
              ))}
            </div>
          ))}
        </section>
      )}

      {(local.projects ?? []).length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">
            Projects ({local.projects!.length})
          </h2>
          {local.projects!.map(proj => (
            <div key={proj.id} className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 space-y-2">
              <div className="flex gap-2 flex-wrap text-sm">
                <span className="font-medium text-zinc-200">{proj.name ?? proj.id}</span>
                {proj.short_stack && <span className="text-xs text-zinc-500 self-center">{proj.short_stack}</span>}
              </div>
              {(proj.bullets ?? []).map((b, i) => (
                <p key={i} className="text-xs text-zinc-400 pl-2 border-l border-zinc-700">{b}</p>
              ))}
            </div>
          ))}
        </section>
      )}

      <div className="flex gap-3 pt-2">
        <button onClick={onBack} className="px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200 border border-zinc-700 rounded-lg">
          ← Add more sources
        </button>
        <button
          onClick={() => onAccept(local)} disabled={saving}
          className="flex-1 py-2 bg-green-700 hover:bg-green-600 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
        >
          {saving ? 'Saving…' : 'Accept profile'}
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Create the wired onboarding page**

```typescript
// app/(app)/onboarding/page.tsx
'use client'
import { useState }        from 'react'
import { useRouter }       from 'next/navigation'
import { SourceBoard }     from '@/components/onboarding/SourceBoard'
import { ProfileReview }   from '@/components/onboarding/ProfileReview'
import type { MergeResult, SparseProfile } from '@/lib/ingest/types'

type Step = 'sources' | 'review'

export default function OnboardingPage() {
  const router = useRouter()
  const [step,        setStep]   = useState<Step>('sources')
  const [mergeResult, setMerge]  = useState<MergeResult | null>(null)
  const [saving,      setSaving] = useState(false)
  const [saveErr,     setSaveErr] = useState<string | null>(null)

  const handleMergeComplete = (result: MergeResult) => {
    setMerge(result); setStep('review')
  }

  const handleAccept = async (profile: SparseProfile) => {
    setSaving(true); setSaveErr(null)
    try {
      const res = await fetch('/api/profiles', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ name: 'My Profile', data: JSON.stringify(profile) }),
      })
      if (!res.ok) {
        const d = await res.json() as { error?: string }
        throw new Error(d.error ?? 'Failed to save profile')
      }
      const { id } = await res.json() as { id: string }

      // Fire-and-forget: generate candidate_profile from the newly saved profile
      void fetch('/api/profile/candidate-profile', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ profileId: id }),
      }).catch(() => { /* non-critical */ })

      router.replace('/config')
    } catch (e) {
      setSaveErr(e instanceof Error ? e.message : String(e))
      setSaving(false)
    }
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="max-w-2xl mx-auto px-4 py-12 space-y-8">
        <div>
          <h1 className="text-2xl font-semibold">Set up your profile</h1>
          <p className="mt-1 text-sm text-zinc-400">
            {step === 'sources'
              ? 'Add sources — a URL, GitHub, or any text. We extract the info and build your profile.'
              : 'Review the extracted profile. Edit anything inline, then accept.'}
          </p>
        </div>
        {saveErr && <p className="text-sm text-red-400">{saveErr}</p>}
        {step === 'sources' && <SourceBoard onMergeComplete={handleMergeComplete} />}
        {step === 'review' && mergeResult && (
          <ProfileReview
            profile={mergeResult.profile}
            conflicts={mergeResult.conflicts}
            onAccept={handleAccept}
            onBack={() => setStep('sources')}
            saving={saving}
          />
        )}
      </div>
    </main>
  )
}
```

- [ ] **Step 4: Run full type-check**

```bash
npx tsc --noEmit 2>&1 | head -30
```

Fix any errors before continuing.

- [ ] **Step 5: Run all unit tests**

```bash
npx vitest run
```

Expected: all PASS. Fix failures before committing.

- [ ] **Step 6: Commit**

```bash
git add components/onboarding/ConflictBanner.tsx \
        components/onboarding/ProfileReview.tsx \
        app/\(app\)/onboarding/page.tsx
git commit -m "feat(ingest): ProfileReview + ConflictBanner + wire full onboarding page"
```

---

## Spec Coverage

| Requirement | Task |
|---|---|
| Fixed schema | Types — Task 1 |
| Firecrawl primary, fetch fallback | Task 6 |
| GitHub API medium-scope extraction | Task 5 |
| Paste text extraction | Task 4 |
| Per-source endpoints, same sparse schema | Tasks 4–6 |
| Parallel extract → single merge call | Task 7 |
| Store partials in DB | Tasks 1–2 |
| Most-specific-wins + explicit conflicts | Task 7 |
| Structured card review (B) | Tasks 10–11 |
| Gap handling: warn + soft minimum | Task 10 (`hasSoftMinimum`) |
| Unified smart input (B) | Task 9 |
| Demo seed removed | Task 8 |
| `/onboarding` separate route | Task 11 |
| Client-side onboarding gate | Task 9 |
| Firecrawl key in settings | Task 3 |
| GitHub ingestion in `/chat` kept | No changes to `/chat` |
| `candidate_profile` auto-gen post-merge | Task 11 (`handleAccept`) |
| One base variant (`genai`) extracted | All extraction prompts use `bullets.genai` only |

**Deferred (tracked in GitHub issues):**
- Drag-to-reorder cards — issue #25
- Conflict inline-resolution UI (banner shown, not yet resolvable inline)
- GitHub optional auth token
- Clip page bookmarklet
- Desktop app — issue #26

# GitHub Repo Ingestion Mockup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a GitHub Import tab to the Chat page where the user pastes a repo URL, fetches README + file tree via GitHub API, gets AI-generated bullet points, edits inline, and clicks "Add to Profile" to append to `pipeline/master_resume_data.json`.

**Architecture:** `lib/github-ingest.ts` handles GitHub API fetch + Anthropic `summarize_repo` tool call; `POST /api/github/ingest` runs the fetch+AI pipeline and returns a structured project entry; `POST /api/github/apply` appends or replaces the project in `master_resume_data.json`; `components/GithubIngest.tsx` is the UI component; `app/chat/page.tsx` gets a second tab toggling between Chat and Import views.

**Tech Stack:** TypeScript, Next.js 14, Anthropic SDK (tool use), native `fetch` for GitHub API (no auth — 60 req/hr anon limit is fine for personal use), React, Tailwind

**Prerequisite:** The Chat page (`app/chat/page.tsx`) must exist (built in the Chat Profile Editor plan).

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `lib/github-ingest.ts` | **Create** | GitHub fetch + Anthropic `summarize_repo` tool call |
| `app/api/github/ingest/route.ts` | **Create** | POST: fetch + AI pipeline, returns project entry |
| `app/api/github/apply/route.ts` | **Create** | POST: append/replace project in master_resume_data.json |
| `components/GithubIngest.tsx` | **Create** | URL input → preview → editable bullets → Add to Profile |
| `app/chat/page.tsx` | Modify | Add Import tab toggle |
| `lib/github-ingest.test.ts` | **Create** | Unit tests for parseGithubUrl and validateBullets |

---

### Task 1: `lib/github-ingest.ts` — fetch + AI summarization

**Files:**
- Create: `lib/github-ingest.test.ts`
- Create: `lib/github-ingest.ts`

- [ ] **Step 1: Write failing tests for pure utility functions**

Create `lib/github-ingest.test.ts`:
```typescript
import { describe, it, expect } from 'vitest'
import { parseGithubUrl, validateBullets } from './github-ingest'

describe('parseGithubUrl', () => {
  it('parses owner and repo from HTTPS URL', () => {
    const result = parseGithubUrl('https://github.com/vietbui1999ru/HomeBoard')
    expect(result).toEqual({ owner: 'vietbui1999ru', repo: 'HomeBoard' })
  })

  it('strips .git suffix', () => {
    const result = parseGithubUrl('https://github.com/foo/bar.git')
    expect(result).toEqual({ owner: 'foo', repo: 'bar' })
  })

  it('returns null for non-github URL', () => {
    expect(parseGithubUrl('https://gitlab.com/foo/bar')).toBeNull()
  })

  it('returns null for URL without repo path', () => {
    expect(parseGithubUrl('https://github.com/foo')).toBeNull()
  })
})

describe('validateBullets', () => {
  it('trims bullets over 116 chars at last word boundary', () => {
    const long = 'Built something very impressive that does many things using many technologies, which resulted in many very good outcomes for everyone'
    // 132 chars — should be trimmed
    const result = validateBullets([long])
    expect(result[0].length).toBeLessThanOrEqual(116)
  })

  it('passes through bullets within limit', () => {
    const short = 'Built X using Y, which produced Z'
    const result = validateBullets([short])
    expect(result[0]).toBe(short)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run lib/github-ingest.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Create `lib/github-ingest.ts`**

```typescript
import Anthropic from '@anthropic-ai/sdk'

export interface ProjectEntry {
  id: string
  name: string
  summary: string
  short_stack: string
  bullets: string[]
}

export function parseGithubUrl(url: string): { owner: string; repo: string } | null {
  try {
    const u = new URL(url)
    if (u.hostname !== 'github.com') return null
    const parts = u.pathname.split('/').filter(Boolean)
    if (parts.length < 2) return null
    return { owner: parts[0], repo: parts[1].replace(/\.git$/, '') }
  } catch {
    return null
  }
}

export function validateBullets(bullets: string[]): string[] {
  return bullets.map(b => {
    if (b.length <= 116) return b
    const trimmed = b.slice(0, 116)
    const lastSpace = trimmed.lastIndexOf(' ')
    return lastSpace > 90 ? trimmed.slice(0, lastSpace) : trimmed
  })
}

async function fetchReadme(owner: string, repo: string): Promise<string> {
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/README.md`
  const res = await fetch(url, { headers: { Accept: 'application/vnd.github.raw' } })
  if (!res.ok) return '(README not found)'
  return (await res.text()).slice(0, 6000)
}

async function fetchFileTree(owner: string, repo: string): Promise<string[]> {
  const url = `https://api.github.com/repos/${owner}/${repo}/git/trees/HEAD?recursive=0`
  const res = await fetch(url, { headers: { Accept: 'application/vnd.github+json' } })
  if (!res.ok) return []
  const data = await res.json() as { tree?: Array<{ path: string; type: string }> }
  return (data.tree ?? [])
    .filter(f => f.type === 'blob' || f.type === 'tree')
    .map(f => f.path)
    .slice(0, 100)
}

const SUMMARIZE_TOOL: Anthropic.Tool = {
  name: 'summarize_repo',
  description: 'Summarize a GitHub repo as a resume project entry',
  input_schema: {
    type: 'object' as const,
    properties: {
      id:          { type: 'string', description: 'URL-safe slug for master_resume_data.json' },
      name:        { type: 'string', description: 'Display name' },
      summary:     { type: 'string', maxLength: 120, description: 'One-sentence project description' },
      short_stack: { type: 'string', maxLength: 40, description: '3-4 primary techs joined by " · "' },
      bullets: {
        type: 'array',
        items: { type: 'string', maxLength: 116 },
        minItems: 3,
        maxItems: 5,
        description: 'Achievement bullets: "Built A doing B using C, which produced D". Each ≥1 tech + ≥1 result. ≤116 chars.',
      },
    },
    required: ['id', 'name', 'summary', 'short_stack', 'bullets'],
  },
}

const SUMMARIZE_SYSTEM = `You are building resume bullet points for Quoc-Viet Bui.
Given a GitHub repo README and file tree, extract a project entry suitable for a software engineering resume.
Bullet formula: "Built A doing B using C, which produced D" — each bullet must include ≥1 named technology and ≥1 measurable or observable result.
Each bullet must be ≤116 characters with spaces. short_stack must be ≤40 chars total.`

export async function summarizeRepo(owner: string, repo: string): Promise<ProjectEntry> {
  const [readme, tree] = await Promise.all([
    fetchReadme(owner, repo),
    fetchFileTree(owner, repo),
  ])

  const userPrompt = `Repository: ${owner}/${repo}

File tree:
${tree.slice(0, 60).join('\n')}

README:
${readme}`

  const client = new Anthropic()
  const response = await client.messages.create({
    model: 'claude-opus-4-7',
    max_tokens: 1024,
    system: SUMMARIZE_SYSTEM,
    tools: [SUMMARIZE_TOOL],
    tool_choice: { type: 'tool', name: 'summarize_repo' },
    messages: [{ role: 'user', content: userPrompt }],
  })

  const toolUse = response.content.find(b => b.type === 'tool_use')
  if (!toolUse || toolUse.type !== 'tool_use') throw new Error('No tool_use in summarize response')

  const entry = toolUse.input as ProjectEntry
  entry.bullets = validateBullets(entry.bullets)
  return entry
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run lib/github-ingest.test.ts
```
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/github-ingest.ts lib/github-ingest.test.ts
git commit -m "feat: add github-ingest lib with URL parser and AI summarization"
```

---

### Task 2: `POST /api/github/ingest`

**Files:**
- Create: `app/api/github/ingest/route.ts`

- [ ] **Step 1: Create the route**

```typescript
import { NextResponse } from 'next/server'
import { parseGithubUrl, summarizeRepo } from '@/lib/github-ingest'

export async function POST(req: Request) {
  const { url } = await req.json() as { url?: string }
  if (!url) return NextResponse.json({ error: 'url required' }, { status: 400 })

  const parsed = parseGithubUrl(url)
  if (!parsed) return NextResponse.json({ error: 'Invalid GitHub URL' }, { status: 400 })

  try {
    const entry = await summarizeRepo(parsed.owner, parsed.repo)
    return NextResponse.json(entry)
  } catch (e) {
    const msg = String(e)
    if (msg.includes('404')) return NextResponse.json({ error: 'Repo not found or private' }, { status: 404 })
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
```

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add app/api/github/ingest/route.ts
git commit -m "feat: add POST /api/github/ingest endpoint"
```

---

### Task 3: `POST /api/github/apply`

**Files:**
- Create: `app/api/github/apply/route.ts`

- [ ] **Step 1: Create the route**

```typescript
import fs from 'fs'
import path from 'path'
import { NextResponse } from 'next/server'

const MASTER_PATH = path.join(process.cwd(), 'pipeline', 'master_resume_data.json')

interface ProjectInput {
  id: string
  name: string
  short_stack: string
  bullets: string[]
}

export async function POST(req: Request) {
  const { project } = await req.json() as { project?: ProjectInput }
  if (!project?.id || !project.bullets?.length) {
    return NextResponse.json({ error: 'project with id and bullets required' }, { status: 400 })
  }

  let master: { projects?: Array<{ id: string; [k: string]: unknown }>; [k: string]: unknown }
  try {
    master = JSON.parse(fs.readFileSync(MASTER_PATH, 'utf8'))
  } catch {
    return NextResponse.json({ error: 'Could not read master_resume_data.json' }, { status: 500 })
  }

  if (!Array.isArray(master.projects)) master.projects = []

  const existingIdx = master.projects.findIndex(p => p.id === project.id)
  const newEntry = { id: project.id, name: project.name, short_stack: project.short_stack, bullets: project.bullets }

  let replaced = false
  if (existingIdx >= 0) {
    master.projects[existingIdx] = newEntry
    replaced = true
  } else {
    master.projects.push(newEntry)
  }

  const tmp = MASTER_PATH + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(master, null, 2), 'utf8')
  fs.renameSync(tmp, MASTER_PATH)

  return NextResponse.json({ ok: true, replaced })
}
```

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add app/api/github/apply/route.ts
git commit -m "feat: add POST /api/github/apply to append project to master_resume_data"
```

---

### Task 4: `GithubIngest` component

**Files:**
- Create: `components/GithubIngest.tsx`

- [ ] **Step 1: Create the component**

```typescript
'use client'
import { useState } from 'react'

interface ProjectEntry {
  id: string
  name: string
  summary: string
  short_stack: string
  bullets: string[]
}

type State = 'idle' | 'loading' | 'preview' | 'applied'

export default function GithubIngest() {
  const [url, setUrl] = useState('')
  const [state, setState] = useState<State>('idle')
  const [entry, setEntry] = useState<ProjectEntry | null>(null)
  const [bullets, setBullets] = useState<string[]>([])
  const [projectId, setProjectId] = useState('')
  const [error, setError] = useState('')

  const fetch_ = async () => {
    if (!url.trim()) return
    setState('loading')
    setError('')
    const res = await fetch('/api/github/ingest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: url.trim() }),
    })
    const data = await res.json()
    if (!res.ok) { setError(data.error ?? 'Fetch failed'); setState('idle'); return }
    setEntry(data as ProjectEntry)
    setBullets(data.bullets)
    setProjectId(data.id)
    setState('preview')
  }

  const apply = async () => {
    if (!entry) return
    const res = await fetch('/api/github/apply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project: { ...entry, id: projectId, bullets } }),
    })
    if (res.ok) setState('applied')
    else setError('Failed to write to profile')
  }

  const charClass = (s: string) => s.length > 116 ? 'text-red-400' : 'text-zinc-300'

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
      <h2 className="text-base font-semibold text-zinc-100">Import from GitHub</h2>

      {/* URL input */}
      <div className="flex gap-2">
        <input
          value={url}
          onChange={e => setUrl(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') fetch_() }}
          placeholder="https://github.com/user/repo"
          disabled={state === 'loading'}
          className="flex-1 bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 disabled:opacity-50"
        />
        <button
          onClick={fetch_}
          disabled={state === 'loading' || !url.trim()}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm rounded disabled:opacity-50"
        >{state === 'loading' ? 'Fetching…' : 'Fetch'}</button>
      </div>

      {error && <p className="text-red-400 text-sm">{error}</p>}

      {state === 'preview' && entry && (
        <div className="space-y-3">
          {/* Summary */}
          <div className="bg-zinc-900 rounded border border-zinc-700 px-4 py-3">
            <p className="text-sm font-semibold text-zinc-100">📦 {entry.name} — <span className="font-normal text-zinc-400">{entry.short_stack}</span></p>
            <p className="text-xs text-zinc-500 mt-1">{entry.summary}</p>
          </div>

          {/* Project ID */}
          <div className="flex items-center gap-2">
            <label className="text-xs text-zinc-500">Project ID:</label>
            <input
              value={projectId}
              onChange={e => setProjectId(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''))}
              className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs font-mono text-zinc-300 w-40 focus:outline-none"
            />
          </div>

          {/* Bullets */}
          <div className="space-y-2">
            <p className="text-xs text-zinc-500">Bullets (edit before adding):</p>
            {bullets.map((b, i) => (
              <div key={i} className="flex items-start gap-2">
                <span className="text-zinc-600 text-xs mt-2 w-3 flex-shrink-0">•</span>
                <div className="flex-1">
                  <textarea
                    value={b}
                    onChange={e => setBullets(prev => prev.map((x, j) => j === i ? e.target.value : x))}
                    rows={2}
                    className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-sm resize-none focus:outline-none focus:border-indigo-500"
                  />
                  <span className={`text-xs ${charClass(b)}`}>{b.length}/116</span>
                </div>
              </div>
            ))}
          </div>

          <button
            onClick={apply}
            className="px-4 py-2 bg-green-700 hover:bg-green-600 text-white text-sm rounded"
          >Add to Profile</button>
        </div>
      )}

      {state === 'applied' && (
        <p className="text-green-400 text-sm">Added to profile ✓ — go to Chat to continue editing.</p>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add components/GithubIngest.tsx
git commit -m "feat: add GithubIngest component"
```

---

### Task 5: Add Import tab to Chat page

**Files:**
- Modify: `app/chat/page.tsx`

- [ ] **Step 1: Add tab state and GithubIngest import**

Add import:
```typescript
import GithubIngest from '@/components/GithubIngest'
```

Add state near the top of the component:
```typescript
  const [tab, setTab] = useState<'chat' | 'import'>('chat')
```

- [ ] **Step 2: Add tab bar above the chat area**

Wrap the existing chat area in a conditional and add a tab bar at the top:
```typescript
      {/* Main content */}
      <div className="flex-1 flex flex-col">
        {/* Tab bar */}
        <div className="flex border-b border-zinc-800 px-4 pt-3 gap-4">
          <button
            onClick={() => setTab('chat')}
            className={`text-sm pb-2 border-b-2 ${tab === 'chat' ? 'border-indigo-400 text-indigo-300' : 'border-transparent text-zinc-500 hover:text-zinc-300'}`}
          >Chat</button>
          <button
            onClick={() => setTab('import')}
            className={`text-sm pb-2 border-b-2 ${tab === 'import' ? 'border-indigo-400 text-indigo-300' : 'border-transparent text-zinc-500 hover:text-zinc-300'}`}
          >Import from GitHub</button>
        </div>

        {tab === 'import' ? (
          <div className="flex-1 overflow-y-auto">
            <GithubIngest />
          </div>
        ) : (
          /* existing message list + input box JSX */
          <>
            {/* message list and input remain here unchanged */}
          </>
        )}
      </div>
```

- [ ] **Step 3: TypeScript check**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Manual smoke test**

Navigate to `http://localhost:3000/chat`. Click "Import from GitHub" tab. Paste a public GitHub repo URL and click Fetch. Verify:
- Spinner shows while loading.
- Repo name, summary, short_stack, and 3+ bullets appear.
- Each bullet has a char counter.
- Editing a bullet updates the counter live.
- Clicking "Add to Profile" writes to `pipeline/master_resume_data.json` (verify with `cat pipeline/master_resume_data.json | grep <project-id>`).
- After apply, success message appears.

- [ ] **Step 5: Commit**

```bash
git add app/chat/page.tsx
git commit -m "feat: add GitHub Import tab to chat page"
```

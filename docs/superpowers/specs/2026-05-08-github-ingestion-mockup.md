# GitHub Repo Ingestion — Mockup Spec

**Date:** 2026-05-08
**Status:** Approved (mockup only — API integration not implemented)

## Goal

Let the user paste a GitHub repo URL and get an AI-generated project entry (name, bullets, short_stack) ready to add to `master_resume_data.json`. The feature lives as a tab on the Chat page. The flow is fetch → summarize → edit inline → add to profile. No implementation in this sprint — this is a design mockup for the UI and the data contract.

## Scope

**In scope (this spec):**
- UI wireframe and component design
- GitHub API fetch strategy
- AI summarization prompt and output schema
- "Add to Profile" data contract (what gets appended to `master_resume_data.json`)

**Out of scope (future):**
- Actual GitHub OAuth or PAT authentication
- Pagination across large repos
- Auto-extraction from PRs or issues

## Architecture

### UI (`app/chat/page.tsx` — second tab)

```
┌─ Sidebar ─┬──────── Import from GitHub ────────────────┐
│ Sessions  │                                             │
│           │  github.com/user/repo         [Fetch]      │
│           │  ─────────────────────────────────────── │
│           │                                             │
│           │  📦 HomeBoard — ASP.NET Core · C# · React  │
│           │  "Full-stack task board with Redis caching  │
│           │   and real-time SignalR updates."           │
│           │                                             │
│           │  Bullets (edit before adding):              │
│           │  ┌────────────────────────────────────┐    │
│           │  │ • Built X doing Y using Z, → W     │    │
│           │  │ • Implemented A with B, reducing C  │    │
│           │  │ • Designed D using E for F outcome  │    │
│           │  └────────────────────────────────────┘    │
│           │                                             │
│           │  Project ID: homeboard  (editable)          │
│           │  Short stack: ASP.NET Core · C# · React     │
│           │                                [Add to Profile] │
└──────────┴─────────────────────────────────────────────┘
```

### Data Fetch (`app/api/github/ingest/route.ts`)

`POST /api/github/ingest`

Request:
```json
{ "url": "https://github.com/vietbui1999ru/HomeBoard" }
```

Steps:
1. Parse owner/repo from URL
2. Fetch `README.md` via GitHub Contents API (`https://api.github.com/repos/{owner}/{repo}/contents/README.md`)
3. Fetch root file tree via Trees API (`https://api.github.com/repos/{owner}/{repo}/git/trees/HEAD`)
4. Pass README + file list to Claude for summarization (tool-use call)
5. Return structured project entry

No auth in mockup — uses unauthenticated GitHub API (60 req/hr limit, sufficient for personal use).

Response:
```json
{
  "id": "homeboard",
  "name": "HomeBoard",
  "summary": "Full-stack task board with Redis caching and real-time SignalR updates.",
  "short_stack": "ASP.NET Core · C# · React",
  "bullets": [
    "Built real-time task board using SignalR and Redis pub/sub, cutting page-refresh latency by 80%",
    "Implemented role-based access control with ASP.NET Core Identity, securing 5 resource types",
    "Designed Docker Compose deployment with PostgreSQL and Redis, enabling one-command local setup"
  ]
}
```

### AI Summarization (`lib/github-ingest.ts`)

Tool schema:
```typescript
{
  name: 'summarize_repo',
  input_schema: {
    type: 'object',
    properties: {
      id:          { type: 'string', description: 'slug for master_resume_data.json projects array' },
      name:        { type: 'string', description: 'Display name' },
      summary:     { type: 'string', maxLength: 120, description: 'One-sentence project description' },
      short_stack: { type: 'string', maxLength: 40, description: '3-4 techs joined by " · "' },
      bullets:     { type: 'array', items: { type: 'string', maxLength: 116 }, minItems: 3, maxItems: 5,
                     description: 'Bullets following the formula: Built A doing B using C, which produced D. Each must contain ≥1 tech + ≥1 result.' }
    },
    required: ['id', 'name', 'summary', 'short_stack', 'bullets']
  }
}
```

System prompt fragment:
```
You are building resume bullet points for Quoc-Viet Bui. Given a GitHub repo's README and file tree, extract:
- What the project does (one sentence)
- The primary tech stack (3-4 techs, ≤40 chars total)
- 3-5 achievement-oriented bullets following: "Built A doing B using C, which produced D"
  Each bullet must include ≥1 named technology and ≥1 measurable or observable result.
  Each bullet must be ≤116 characters with spaces.
```

### "Add to Profile" (`POST /api/github/apply`)

Request:
```json
{
  "project": {
    "id": "homeboard",
    "name": "HomeBoard",
    "short_stack": "ASP.NET Core · C# · React",
    "bullets": ["..."]
  }
}
```

Reads `master_resume_data.json`, appends to the `projects` array (or replaces if `id` already exists), writes back. Returns `{ "ok": true, "replaced": false }`.

## Component (`components/GithubIngest.tsx`)

States:
- `idle` — URL input + Fetch button
- `loading` — spinner, "Fetching repo…"
- `preview` — editable bullet list + Add to Profile button
- `applied` — "Added to profile ✓" with link to Chat to continue editing

Bullet editing: simple `<textarea>` per bullet with live char-count indicator (red at >116c).

## Error Handling

- GitHub API 404: "Repo not found or private."
- README missing: proceed with file tree only; note in summary that README was absent.
- AI returns bullet > 116c: auto-trim at last word boundary; show warning in UI.
- `master_resume_data.json` write fails: show error, do not corrupt existing file (write to temp first, then rename).

## Not Implemented in This Spec

- GitHub PAT / OAuth for private repos
- Fetching source files beyond README (future: selective file sampling for deeper context)
- Batch import of multiple repos
- Diff-preview before writing (future: reuse Chat `propose_edit` pattern)

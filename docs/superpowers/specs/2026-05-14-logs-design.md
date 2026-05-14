# Generation Logs — API & Test Design Spec

**Date:** 2026-05-14
**Branch:** main
**Status:** Approved

## Goal

Expose the existing `GenerationLogger` output (per-run JSON files in `logs/generate/`) via a private HTTP API. Add comprehensive tests for both the logger class and the new endpoint. Rate-limit destructive operations. Extract the existing in-memory rate limiter into a reusable shared module.

## Background

`lib/generation-logger.ts` already writes structured JSON logs to `logs/generate/{jobId}__{timestamp}.json` for every generation pipeline run. The file exports:
- `GenerationLogger` class — appends stage entries, AI decision, script content, outcome
- `listLogs(jobId?)` — returns sorted file paths, newest first
- `readLog(logPath)` — parses a log file, returns `GenerationLog | null`

No HTTP endpoint currently exposes these files. This spec adds one.

## Auth Model

Two accepted credentials, checked in order:

1. **NextAuth session** — standard browser session via `auth()`. Consistent with all other protected routes.
2. **Static API key** — `Authorization: Bearer <LOGS_API_KEY>` header. Useful for curl/scripts. Only active when `LOGS_API_KEY` env var is set. If the env var is absent, Bearer auth is always denied (safe default — opt-in only).

Implemented in `lib/logs-auth.ts`:

```typescript
export async function checkLogsAuth(req: Request): Promise<boolean>
```

Flow:
```
1. session = await auth()
2. if session?.user?.id → true
3. apiKey = process.env.LOGS_API_KEY
4. if !apiKey → false
5. if req.headers.get('authorization') === `Bearer ${apiKey}` → true
6. → false
```

## Data Shapes

### LogSummary (list response, default)

```typescript
interface LogSummary {
  id:            string            // filename without .json — stable URL key
  jobId:         string
  company:       string
  role_title:    string
  outcome?:      'success' | 'failed'
  started_at:    string            // ISO timestamp
  completed_at?: string
  stage_count:   number            // length of stages array
}
```

Heavy fields omitted from summary: `stages`, `ai_decision`, `script_content`.

### Full log

The existing `GenerationLog` type from `lib/generation-logger.ts` — returned by `GET /api/logs?full=true` and `GET /api/logs/[id]`.

## ID Format

Log file names follow: `{jobId}__{YYYY}-{MM}-{DD}T{HH}-{MM}-{SS}.json`

The URL `id` is the filename without `.json`, e.g.:
```
airbnb-ios-software-engineer__2026-05-09T20-53-46
```

Path safety: `id` is validated against `^[\w-]+__\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}$` before resolving to disk. Anything that fails → 400. After regex pass, the resolved absolute path is verified to stay within `LOG_DIR` (defense-in-depth against symlink edge cases).

## Endpoints

All endpoints return 403 when auth fails.

### `GET /api/logs`

List recent logs.

Query params:
- `limit` — integer, clamped to 1–200, default 50
- `jobId` — filter by job ID prefix (forwarded to `listLogs`)
- `full` — if `"true"`, return full `GenerationLog` bodies instead of summaries

Response (summary, default):
```json
[{ "id": "...", "jobId": "...", "company": "...", "role_title": "...",
   "outcome": "success", "started_at": "...", "completed_at": "...", "stage_count": 6 }]
```

### `GET /api/logs/[id]`

Full log for a single run. Returns 404 if not found or id is invalid.

Response: `GenerationLog` JSON.

### `DELETE /api/logs/[id]`

Delete a single log file. Rate limited: 10 req/min per IP.

Returns 404 if not found. Returns `{ ok: true }` on success.

### `DELETE /api/logs`

Delete all log files. Rate limited: 10 req/min per IP.

Returns `{ ok: true, deleted: N }` where N is the count of files removed.

## Rate Limiting

Only DELETE methods are rate limited. GET operations on a local filesystem are cheap and already auth-gated.

Extracted to `lib/rate-limit.ts` — the existing in-memory IP-based limiter currently duplicated inside `app/api/settings/ai/route.ts`. Configuration: 10 requests per 60-second window per IP.

```typescript
export function checkRateLimit(ip: string, opts?: { window?: number; max?: number }): boolean
export function extractIp(req: Request): string
```

`app/api/settings/ai/route.ts` is updated to import from `lib/rate-limit.ts` instead of its current inline copy.

## Service Layer

`lib/logs-service.ts` — pure functions, no HTTP, no auth. All disk access goes through `resolveLogPath` first.

```typescript
// Validate id and resolve to absolute path. Returns null if invalid/unsafe.
export function resolveLogPath(id: string): string | null

// Strip heavy fields from a full log; add id and stage_count.
export function toSummary(log: GenerationLog, id: string): LogSummary

// List recent logs as summaries.
export function listSummaries(opts: { limit: number; jobId?: string }): LogSummary[]

// List recent logs as full bodies.
export function listFull(opts: { limit: number; jobId?: string }): GenerationLog[]

// Read one log by id. Returns null if id invalid or file missing.
export function getLog(id: string): GenerationLog | null

// Delete one log by id. Returns false if id invalid or file missing.
export function deleteLog(id: string): boolean

// Delete all logs. Returns count of files removed.
export function purgeAll(): number
```

## Files Changed

| Action | File |
|---|---|
| Create | `lib/rate-limit.ts` |
| Create | `lib/logs-auth.ts` |
| Create | `lib/logs-service.ts` |
| Create | `app/api/logs/route.ts` |
| Create | `app/api/logs/[id]/route.ts` |
| Modify | `app/api/settings/ai/route.ts` — swap inline limiter → `lib/rate-limit.ts` |
| Create | `lib/generation-logger.test.ts` |
| Create | `lib/logs-service.test.ts` |
| Create | `app/api/logs/route.test.ts` |
| Create | `app/api/logs/[id]/route.test.ts` |

## Test Plan

### `lib/generation-logger.test.ts` (10 tests, mocked fs)

- `constructor` creates log dir and writes initial JSON
- `stage()` appends a new entry
- `stage()` replaces existing `running` entry for same stage name (dedup)
- `setAIDecision()` sets field and flushes
- `setScript()` sets both fields and flushes
- `finish()` sets outcome + completed_at and flushes
- `listLogs()` returns `[]` when dir absent
- `listLogs()` returns files sorted newest-first
- `listLogs(jobId)` filters by jobId prefix
- `readLog()` parses valid JSON; returns null on missing or corrupt file

### `lib/logs-service.test.ts` (9 tests, mocked fs + generation-logger)

- `resolveLogPath()` accepts valid id, returns correct absolute path
- `resolveLogPath()` rejects ids containing `..`, `/`, null bytes, wrong format
- `toSummary()` strips `stages`, `ai_decision`, `script_content`; sets `stage_count`
- `listSummaries()` respects `limit`; returns summaries not full logs
- `listSummaries()` forwards `jobId` filter
- `listFull()` returns full `GenerationLog` bodies
- `getLog()` returns null for invalid id; returns parsed log for valid id
- `deleteLog()` returns false for invalid id; calls `fs.unlinkSync` for valid
- `purgeAll()` deletes all files; returns count

### `app/api/logs/route.test.ts` (mocked auth + service)

- 403 when auth fails (no session, no key)
- 200 with summaries on `GET /api/logs`
- 200 with full bodies on `GET /api/logs?full=true`
- `limit` param clamped to 1–200 (out-of-range values corrected)
- 200 on `DELETE /api/logs`, body `{ ok: true, deleted: N }`
- 429 on `DELETE /api/logs` when rate limit exceeded

### `app/api/logs/[id]/route.test.ts` (mocked auth + service)

- 403 when auth fails
- 200 with full log on `GET /api/logs/[id]`
- 404 when `getLog` returns null (missing or invalid id)
- 200 on `DELETE /api/logs/[id]`
- 404 when `deleteLog` returns false
- 429 on `DELETE /api/logs/[id]` when rate limit exceeded

## Environment Variables

```bash
LOGS_API_KEY=<secret>    # optional; enables Bearer auth on /api/logs endpoints
```

Add to `.env.local` example and `.env.prod.example`.

## Out of Scope

- Pagination beyond `limit` (cursor/offset pagination not needed at this scale)
- Log streaming / tailing via SSE (covered by the separate tracing spec)
- Log retention policy / TTL cleanup (can be added later)
- Frontend UI for viewing logs (terminal curl workflow is the primary use case)

# Tracing & Live Observability — Design Spec

**Date:** 2026-05-13
**Branch:** worktree-feat+cicd-pipelines
**Status:** Approved

## Goal

Add real-time live observability to the generation pipeline and all API routes. Primary use: watch executions from a terminal pane via curl while they happen. Secondary use: query past traces by ID from SQLite.

## Approach

Middleware-first instrumentation with manual spans for internal critical paths. No external dependencies. Zero-config defaults with opt-in per category.

## Data Model

Every trace event is a single flat record stored in SQLite and the ring buffer:

```typescript
interface TraceEvent {
  traceId:   string                    // UUID — groups all spans in one request/execution
  spanId:    string                    // UUID — this specific span
  parentId?: string                    // parent spanId — omitted for root spans
  name:      string                    // see Name Registry below
  ts:        string                    // ISO timestamp (start of span)
  duration?: number                    // ms — set when span ends, absent while running
  level:     'info' | 'warn' | 'error'
  data:      Record<string, unknown>   // event-specific payload
}
```

### Name Registry

| Name | Source | Auto/Manual |
|---|---|---|
| `http.request` | middleware.ts | Auto |
| `pipeline.preflight` | generate-pipeline.ts | Manual |
| `pipeline.ai-reason` | generate-pipeline.ts | Manual |
| `pipeline.write-script` | generate-pipeline.ts | Manual |
| `pipeline.build` | generate-pipeline.ts | Manual |
| `pipeline.validate` | generate-pipeline.ts | Manual |
| `pipeline.fix-loop` | generate-pipeline.ts | Manual |
| `pipeline.finalize` | generate-pipeline.ts | Manual |
| `ai.anthropic_call` | ai-reason.ts | Manual |
| `db.query` | db.ts | Manual (opt-in) |

### Data Payloads

```typescript
// http.request
{ method: string, path: string, status: number, query?: string }

// pipeline.*
{ status: 'ok' | 'fail' | 'running', attempt?: number, stdout?: string, stderr?: string }

// pipeline.ai-reason
{ status: string, ai_decision?: Record<string, unknown> }

// pipeline.write-script
{ status: string, script_path?: string, script_content?: string }

// ai.anthropic_call
{ model: string, inputTokens: number, outputTokens: number,
  promptHead: string, promptTail: string, replyHead: string, replyTail: string }

// db.query (opt-in)
{ op: string, table: string }
```

## Core Library — `lib/tracer.ts`

Singleton module. Initialized once on first import.

```typescript
interface TracerConfig {
  http:          boolean  // default: true
  pipeline:      boolean  // default: true
  ai:            boolean  // default: true
  db:            boolean  // default: false
  bufferSize:    number   // default: 200
  truncateChars: number   // default: 300
  logFile:       string   // default: "logs/traces.log"
}

const tracer = {
  configure(config: Partial<TracerConfig>): void
  startTrace(name: string, data?: Record<string, unknown>): TraceContext
  startSpan(ctx: TraceContext, name: string, parentId?: string): SpanContext
  endSpan(ctx: SpanContext, level: 'info'|'warn'|'error', data: Record<string, unknown>): void
  wrap<T>(ctx: TraceContext, name: string, fn: () => Promise<T>, parentId?: string): Promise<T>
}
```

### Storage

- **Ring buffer:** last `bufferSize` complete traces in memory. Used by the live SSE endpoint.
- **SQLite:** `traces` table (one row per event). Written via `setImmediate` — never blocks the hot path. Used by `/api/traces` and `/api/traces/[id]`.

### Emission Pipeline

On every `endSpan()` call, the tracer:
1. Pushes event to ring buffer
2. Schedules async SQLite write
3. Pushes event to all active SSE subscribers
4. Writes formatted line to stdout (if `NODE_ENV !== 'production'`)
5. Appends formatted line to `logs/traces.log`

## Instrumentation Points

### Auto — `middleware.ts`

Wraps every incoming request. Creates root trace, sets `X-Trace-Id` response header, ends span after response with status + latency.

### Manual — `lib/generate-pipeline.ts`

Replaces existing `GenerationLogger` (which is removed). Each pipeline stage becomes a `tracer.wrap()` call. `ai_decision` and `script_content` stored as span data on the `pipeline.ai-reason` and `pipeline.write-script` spans respectively.

### Manual — `lib/ai-reason.ts`

Wraps the `anthropic.messages.create()` call. Captures model, token counts, and truncated prompt/reply (first+last `truncateChars` characters).

### Manual — `lib/db.ts` (opt-in)

Thin wrapper around `db.prepare().run/get/all`. Off by default (`TRACING_DB=false`) because query volume is high.

## Migration: GenerationLogger → Tracer

`lib/generation-logger.ts` is deleted. `generate-pipeline.ts` drops its `GenerationLogger` import and replaces all `logger.*` calls with tracer spans. The per-run JSON files in `logs/generate/` are superseded by SQLite + the `/api/traces/[id]` endpoint.

## Endpoints

All three routes live under `app/api/traces/`. All gated: accessible only when `NODE_ENV !== 'production'` OR `TRACING_ENABLED=true` is explicitly set.

### `GET /api/traces/live`

SSE stream. Pushes every `TraceEvent` to all connected clients as it is emitted.

```bash
# Machine-readable NDJSON stream
curl -N http://localhost:3000/api/traces/live

# Human-readable tree-indented, ANSI-colorized
curl -N http://localhost:3000/api/traces/live?format=pretty

# Filter by span name prefix
curl -N http://localhost:3000/api/traces/live?filter=pipeline
```

Pretty format renders parent-child tree structure using box-drawing characters (`├─`, `└─`), colorized by span name category (purple=http, amber=pipeline, amber=ai, gray=db). Errors in red.

### `GET /api/traces`

List recent traces from SQLite.

```bash
curl http://localhost:3000/api/traces?limit=20
# [{ traceId, name, ts, duration, level, spanCount }, ...]
```

### `GET /api/traces/[id]`

Full trace with all spans, sorted by `ts`.

```bash
curl http://localhost:3000/api/traces/a1b2c3d4 | jq
# { traceId, spans: [TraceEvent, ...], startedAt, duration, outcome }
```

## Configuration

Via env vars in `.env.local`. All optional — defaults work out of the box.

```bash
TRACING_HTTP=true           # auto-instrument all routes (default: true)
TRACING_PIPELINE=true       # pipeline stage spans (default: true)
TRACING_AI=true             # Anthropic call spans (default: true)
TRACING_DB=false            # SQLite query spans (default: false)
TRACING_BUFFER_SIZE=200     # ring buffer depth (default: 200)
TRACING_TRUNCATE=300        # chars to keep from prompt/reply head+tail (default: 300)
```

## SQLite Schema

```sql
CREATE TABLE IF NOT EXISTS trace_events (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  trace_id  TEXT NOT NULL,
  span_id   TEXT NOT NULL,
  parent_id TEXT,
  name      TEXT NOT NULL,
  ts        TEXT NOT NULL,
  duration  INTEGER,
  level     TEXT NOT NULL DEFAULT 'info',
  data      TEXT NOT NULL DEFAULT '{}'  -- JSON
);

CREATE INDEX IF NOT EXISTS idx_trace_events_trace_id ON trace_events(trace_id);
CREATE INDEX IF NOT EXISTS idx_trace_events_ts       ON trace_events(ts);
CREATE INDEX IF NOT EXISTS idx_trace_events_name     ON trace_events(name);
```

## Files Changed

| Action | File |
|---|---|
| Create | `lib/tracer.ts` |
| Delete | `lib/generation-logger.ts` |
| Modify | `middleware.ts` — add root trace creation |
| Modify | `lib/generate-pipeline.ts` — replace GenerationLogger with tracer spans |
| Modify | `lib/ai-reason.ts` — wrap Anthropic call with tracer.wrap() |
| Create | `app/api/traces/live/route.ts` |
| Create | `app/api/traces/route.ts` |
| Create | `app/api/traces/[id]/route.ts` |
| Modify | `lib/db.ts` — add trace_events migration + optional query tracing wrapper |
| Modify | `.env.local` / `.env.prod.example` — add TRACING_* vars |

## Out of Scope

- Frontend UI for traces (not planned)
- Production tracing / sampling
- OpenTelemetry export
- Chat pipeline tracing (can be added later following same pattern)

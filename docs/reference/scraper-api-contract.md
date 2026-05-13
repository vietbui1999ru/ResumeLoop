# Scraper API Contract

> **Status**: Draft — experimental. Not yet implemented.
> **Branch**: `experimental/scraper-api`
> **Purpose**: Contract-first spec for the ResumeAnalyze ↔ JobScraper microservice interface.
> Build the scraper against this doc. Scaffold ResumeAnalyze integration once the scraper is live.

---

## Overview

The JobScraper is an independent Python microservice that:
- Maintains a persistent Chrome session on a home server (Pydoll, CDP-native)
- Polls RSS feeds, Greenhouse/Ashby APIs, LinkedIn, Indeed
- Owns its own database (jobs + people)
- Exposes a pull-based REST API consumed by ResumeAnalyze

ResumeAnalyze is the **consumer** — it polls on a schedule or via manual trigger. The scraper never pushes.

```
[Home Server]                     [ResumeAnalyze]
  Pydoll Chrome session  ──────►  GET /jobs?since=...
  RSS feeds              ←──────  POST /scrape:trigger
  Greenhouse / Ashby API          GET /people
  Scraper DB (owns data)          GET /health
```

---

## Base URL

```
http://scraper.local:8420   # Tailscale internal hostname (preferred)
http://<tailscale-ip>:8420  # fallback if DNS not configured
```

All paths are versioned under `/v1`.

---

## Authentication

Every request must include:

```
X-Scraper-Key: <shared-secret>
```

The secret is a static string configured in both services via environment variable:
- Scraper: `SCRAPER_API_KEY`
- ResumeAnalyze: `SCRAPER_API_KEY`

On Tailscale, traffic is already encrypted. The shared secret is a second layer to prevent accidental exposure if the port is ever exposed beyond the Tailscale network.

No OAuth, no JWT. If the key is missing or wrong: `401 Unauthorized`.

---

## Data Shapes

### Job

```typescript
interface Job {
  id: string                      // scraper-internal UUID
  source: JobSource               // where it came from
  url: string                     // canonical job posting URL
  company: string
  role_title: string
  location: string | null         // "Remote", "New York, NY", etc.
  remote: boolean | null          // null = unknown
  raw_content: string             // full text of the posting (markdown or plaintext)
  structured: JobStructured | null // parsed fields; null if extraction failed
  tags: string[]                  // e.g. ["visa-kill", "genai", "senior"]
  fit_pct: number | null          // 0–100; null until scored
  apply_url: string | null        // direct apply link if different from url
  clipped_at: string              // ISO 8601 UTC
  updated_at: string              // ISO 8601 UTC
}

type JobSource =
  | 'rss'
  | 'greenhouse'
  | 'ashby'
  | 'linkedin'
  | 'indeed'
  | 'web_clip'    // manual Obsidian web clipper import
  | 'manual'

interface JobStructured {
  salary_min: number | null
  salary_max: number | null
  salary_currency: string | null  // "USD"
  visa_sponsorship: boolean | null
  experience_years_min: number | null
  tech_stack: string[]
  role_track: string | null       // "genai" | "systems" | "IT-track" | ...
  description_summary: string | null  // ≤500 chars, LLM-generated
}
```

### Person

```typescript
interface Person {
  id: string                      // scraper-internal UUID
  job_id: string | null           // linked job, if sourced from a JD
  full_name: string
  title: string | null
  company: string | null
  linkedin_url: string | null
  email: string | null            // null until enriched
  source: PersonSource
  ai_card: string | null          // LLM-generated 2–3 sentence summary
  notes: string | null
  raw_markdown: string            // original scraped text
  created_at: string
  updated_at: string
}

type PersonSource =
  | 'linkedin'
  | 'company_page'
  | 'manual'
  | 'enriched'    // was another source, then email-enriched
```

### Operation (async job tracking)

```typescript
interface Operation {
  id: string                   // UUID
  type: OperationType
  status: 'pending' | 'running' | 'done' | 'failed'
  progress: number             // 0–100
  result: OperationResult | null
  error: string | null
  created_at: string
  updated_at: string
}

type OperationType =
  | 'scrape_jobs'
  | 'enrich_person'

interface OperationResult {
  jobs_found?: number
  jobs_new?: number
  person_id?: string
}
```

---

## Endpoints

### `GET /v1/jobs`

Poll for jobs. Primary ingestion endpoint.

**Query parameters:**

| Param | Type | Default | Description |
|---|---|---|---|
| `since` | ISO 8601 string | none | Return only jobs clipped/updated after this timestamp |
| `source` | `JobSource` | all | Filter by source |
| `tag` | string | none | Filter by tag (single value) |
| `limit` | integer | 50 | Max results; cap at 200 |
| `offset` | integer | 0 | Pagination offset |

**Response `200`:**

```typescript
{
  jobs: Job[]
  total: number   // total matching (ignores limit/offset)
  has_more: boolean
}
```

**Example:** Poll for everything new since last sync:
```
GET /v1/jobs?since=2026-05-10T00:00:00Z&limit=100
```

---

### `POST /v1/scrape:trigger`

Manually trigger a scrape run. Returns an operation ID for polling.

**Body:**

```typescript
{
  sources?: JobSource[]    // omit = all configured sources
  query?: string           // freeform search hint, passed to supported sources
  limit?: number           // max jobs to fetch per source; default 25
}
```

**Response `202`:**

```typescript
{
  operation_id: string
}
```

---

### `GET /v1/operations/{id}`

Poll an async operation started by `:trigger` or `:enrich`.

**Response `200`:**

```typescript
Operation
```

Returns `404` if operation ID not found.

---

### `GET /v1/people`

Pull the people list.

**Query parameters:**

| Param | Type | Default | Description |
|---|---|---|---|
| `job_id` | string | none | Filter by linked job |
| `since` | ISO 8601 | none | Updated after timestamp |
| `limit` | integer | 50 | Max results |
| `offset` | integer | 0 | Pagination offset |

**Response `200`:**

```typescript
{
  people: Person[]
  total: number
  has_more: boolean
}
```

---

### `POST /v1/people:enrich`

Trigger email enrichment for a person.

**Body:**

```typescript
{
  person_id: string
}
```

**Response `202`:**

```typescript
{
  operation_id: string
}
```

---

### `GET /v1/health`

Liveness + readiness check. No auth required.

**Response `200`:**

```typescript
{
  status: 'ok' | 'degraded'
  chrome_session: boolean   // persistent Pydoll session alive
  db: boolean
  uptime_seconds: number
  version: string
}
```

---

## Error Responses

All errors follow this shape:

```typescript
{
  error: string    // machine-readable code, e.g. "invalid_since_param"
  message: string  // human-readable description
}
```

| Status | Meaning |
|---|---|
| `400` | Bad request (invalid param, malformed body) |
| `401` | Missing or wrong `X-Scraper-Key` |
| `404` | Resource not found |
| `429` | Rate limited (scraper self-protecting; back off and retry) |
| `500` | Scraper internal error |
| `503` | Chrome session down or scraper starting up |

---

## Operational Notes

### Scraper stack (for reference, not consumed by this API)

- **Browser**: Pydoll (CDP-native Python, no `navigator.webdriver` flag)
- **Session**: persistent Chrome instance — never closes, preserves cookies/extensions
- **IP**: home server residential IP — most trustworthy signal against bot detection
- **RSS**: direct feed polling (no browser needed) — zero detection risk
- **Greenhouse / Ashby**: official public job board APIs — no auth needed, structured JSON
- **LinkedIn / Indeed**: Pydoll with behavioral mimicry (random delays, human-like scroll patterns)

### ResumeAnalyze polling strategy (to be implemented)

- **Scheduled**: every 4h via a lightweight cron or Next.js route handler with `node-cron`
- **Manual**: "Sync Jobs" button → `POST /v1/scrape:trigger` → poll `/v1/operations/{id}` until done → `GET /v1/jobs?since=<last_sync>` → upsert into local DB
- **Cursor**: store `last_synced_at` in `app_settings` table under key `scraper_last_synced_at`

### Search config ownership

The scraper owns its search config (keywords, sources, company watchlist). ResumeAnalyze does not send a target list — it just consumes whatever the scraper found. Future: add a `PATCH /v1/config` endpoint if dynamic config becomes necessary.

---

## Version

`v1` — initial contract. Breaking changes require a new path prefix (`/v2`). Additive changes (new optional fields, new query params) are non-breaking.

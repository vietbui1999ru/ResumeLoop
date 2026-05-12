---
title: "API Reference"
description: "Complete reference for all ResumeAnalyze HTTP endpoints — request shapes, response shapes, and curl examples."
sidebar_position: 1
tags: [api, reference, http]
updated: 2026-05-11
---

# API Reference

All endpoints are served from the Next.js app. Replace `BASE=http://localhost:3000` with your deployment URL.

## Authentication

All endpoints except `GET /api/health` and `POST /api/auth/signup` require an authenticated session.
Authentication is handled by NextAuth via a `next-auth.session-token` cookie.

To obtain the cookie value: open DevTools → Application → Cookies → copy `next-auth.session-token`.

Sign in through the UI at `POST /api/auth/callback/credentials` (NextAuth standard flow) or use the demo account `demo@demo.com` / `demo`.

```bash
BASE=http://localhost:3000
TOKEN=<paste-session-token-here>
AUTH="-b \"next-auth.session-token=$TOKEN\""
```

---

## Health

### `GET /api/health`

Returns server liveness. No authentication required.

**Response**

```json
{ "ok": true, "ts": 1715433600000 }
```

**curl**

```bash
curl "$BASE/api/health"
```

---

## Auth

### `POST /api/auth/signup`

Creates a new user account. No authentication required.

**Request body**

```json
{ "email": "user@example.com", "password": "mypassword" }
```

| Field      | Type   | Constraints                              |
|------------|--------|------------------------------------------|
| `email`    | string | Valid email format; `demo@demo.com` reserved |
| `password` | string | 8–128 characters                         |

**Response — success (200)**

```json
{ "ok": true }
```

**Response — errors**

| Status | Body                                        | Reason                      |
|--------|---------------------------------------------|-----------------------------|
| 400    | `{ "error": "Invalid email" }`              | Malformed email              |
| 400    | `{ "error": "Password must be ≥8 characters" }` | Password too short      |
| 400    | `{ "error": "Password too long" }`          | Password exceeds 128 chars   |
| 400    | `{ "error": "That email is reserved" }`     | `demo@demo.com` used         |
| 409    | `{ "error": "Email already registered" }`   | Duplicate account            |

**curl**

```bash
curl -X POST "$BASE/api/auth/signup" \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"supersecret123"}'
```

---

## Jobs

### `GET /api/jobs`

Returns all scanned job listings, ordered by company name. Optionally filter by keyword.

**Auth required:** yes

**Query params**

| Param | Type   | Description                                                     |
|-------|--------|-----------------------------------------------------------------|
| `q`   | string | Optional. Searches `company`, `role_title`, `role_track`, and raw content. |

**Response — success (200)**

Array of job summary objects:

```json
[
  {
    "id": "abc123",
    "company": "Acme Corp",
    "role_title": "Software Engineer",
    "role_track": "systems",
    "fit_pct": 78,
    "visa_status": "proceed",
    "tags": "resume-ed",
    "action": "1-Applied",
    "file_mtime": "2026-05-01T10:00:00.000Z",
    "scanned_at": "2026-05-10T08:00:00.000Z",
    "has_reasoning": 1,
    "has_output": 1
  }
]
```

`has_reasoning` and `has_output` are `0` or `1` (SQLite boolean integers).

**curl**

```bash
# All jobs
curl -b "next-auth.session-token=$TOKEN" "$BASE/api/jobs"

# Filtered
curl -b "next-auth.session-token=$TOKEN" "$BASE/api/jobs?q=backend"
```

---

### `GET /api/jobs/:id`

Returns full detail for a single job, including `file_path` and `raw_content`.

**Auth required:** yes

**Path params**

| Param | Type   | Description |
|-------|--------|-------------|
| `id`  | string | Job ID      |

**Response — success (200)**

```json
{
  "id": "abc123",
  "company": "Acme Corp",
  "role_title": "Software Engineer",
  "role_track": "systems",
  "fit_pct": 78,
  "visa_status": "proceed",
  "tags": "resume-ed",
  "action": "1-Applied",
  "apply_url": "https://example.com/apply/abc123",
  "hidden": 0,
  "file_mtime": "2026-05-01T10:00:00.000Z",
  "scanned_at": "2026-05-10T08:00:00.000Z",
  "file_path": "/Users/you/JobData/Jobs/acme-swe.md",
  "raw_content": "# Acme Corp — Software Engineer\n..."
}
```

**Response — error**

| Status | Body                      |
|--------|---------------------------|
| 404    | `{ "error": "Not found" }` |

**curl**

```bash
curl -b "next-auth.session-token=$TOKEN" "$BASE/api/jobs/abc123"
```

---

### `PATCH /api/jobs/:id`

Updates one or more fields on a job (action, apply_url, hidden).

**Auth required:** yes

**Path params**

| Param | Type   | Description |
|-------|--------|-------------|
| `id`  | string | Job ID      |

**Request body**

```json
{
  "action": "1-Applied",
  "apply_url": "https://example.com/apply/abc123",
  "hidden": 0
}
```

All fields are optional; only provided fields are updated.

| Field      | Type   | Description |
|------------|--------|-------------|
| `action`   | string | Pipeline stage: `0-Saved` through `6-Ghosted` |
| `apply_url` | string | URL to application form |
| `hidden`   | 0 \| 1 | Visibility flag |

**Response — success (200)**

```json
{ "ok": true }
```

**Response — errors**

| Status | Body                                       | Reason                         |
|--------|-------------------------------------------|--------------------------------|
| 400    | `{ "error": "Invalid action. Must be one of: ..." }` | Unknown action value |
| 400    | `{ "error": "apply_url must be a valid URL" }` | Invalid URL format |
| 404    | `{ "error": "Not found" }`                 | Job not found |
| 500    | `{ "error": "File write failed" }`         | Frontmatter write error |

**curl**

```bash
curl -X PATCH -b "next-auth.session-token=$TOKEN" "$BASE/api/jobs/abc123" \
  -H "Content-Type: application/json" \
  -d '{"action":"1-Applied","apply_url":"https://example.com/apply/abc123"}'
```

---

### `GET /api/jobs/:id/output`

Returns the most recent generation output record for a job.

**Auth required:** yes

**Response — success (200)**

```json
{
  "id": "out-uuid",
  "job_id": "abc123",
  "docx_path": "/path/to/resume.docx",
  "pdf_path": "/path/to/resume.pdf",
  "projects_used": "HomeBoard,SpotiSwipe,CalAI",
  "work_ids_used": "gitlab,carboncopies,udayton",
  "variant": "genai",
  "tagline": "Full-Stack SWE building AI products with Go and React",
  "reasoning": "...",
  "cover_letter": "Dear Hiring Manager...",
  "built_at": "2026-05-10T09:00:00.000Z"
}
```

**Response — error**

| Status | Body                          |
|--------|-------------------------------|
| 404    | `{ "error": "No output found" }` |

**curl**

```bash
curl -b "next-auth.session-token=$TOKEN" "$BASE/api/jobs/abc123/output"
```

---

### `GET /api/jobs/:id/preview`

Streams the PDF for the most recent output. Redirects to a presigned S3 URL in cloud mode; serves the file directly in local mode.

**Auth required:** yes

**Response — success**

- `200 application/pdf` with `Content-Disposition: inline` (local mode)
- `302` redirect to presigned S3 URL (cloud mode)

**Response — errors**

| Status | Body                                 | Reason                              |
|--------|--------------------------------------|-------------------------------------|
| 400    | `{ "error": "Not a PDF file" }`       | `pdf_path` does not end in `.pdf`   |
| 403    | `{ "error": "Invalid path" }`         | Path outside safe roots             |
| 404    | `{ "error": "PDF not available" }`    | No output or `pdf_path` is null     |
| 404    | `{ "error": "PDF file missing on disk" }` | File deleted after generation   |
| 500    | `{ "error": "Could not generate preview URL" }` | S3 presign failure        |

**curl**

```bash
curl -b "next-auth.session-token=$TOKEN" -o preview.pdf "$BASE/api/jobs/abc123/preview"
```

---

### `PATCH /api/jobs/:id/action`

Updates the pipeline action stage for a job and writes it back to the markdown frontmatter.

**Auth required:** yes

**Request body**

```json
{ "action": "1-Applied" }
```

Valid values for `action`:

```
0-Saved | 1-Applied | 2-Phone Screen | 3-Interview | 4-Offer | 5-Rejected | 6-Ghosted
```

**Response — success (200)**

```json
{ "ok": true }
```

**Response — errors**

| Status | Body                                       | Reason                         |
|--------|--------------------------------------------|--------------------------------|
| 400    | `{ "error": "Invalid action. Must be one of: ..." }` | Unknown action value |
| 404    | `{ "error": "Not found" }`                 | Job not found or path mismatch |
| 500    | `{ "error": "File write failed" }`         | Filesystem write error         |

**curl**

```bash
curl -X PATCH -b "next-auth.session-token=$TOKEN" "$BASE/api/jobs/abc123/action" \
  -H "Content-Type: application/json" \
  -d '{"action":"1-Applied"}'
```

> **Note:** This endpoint is deprecated. Use `PATCH /api/jobs/:id` instead to update action and other fields.

---

### `POST /api/jobs/:id/cover-letter`

Generates a cover letter for the job using the active AI provider. Streams plain text.
Persists the full text to `jd_outputs.cover_letter` after the stream completes.

**Auth required:** yes (reads session user ID for provider config)

**Request body**

None.

**Response — success (200)**

`Content-Type: text/plain; charset=utf-8` — streaming plain text.

**Response — error**

| Status | Body                           |
|--------|--------------------------------|
| 404    | `{ "error": "Job not found" }` |

**curl**

```bash
curl -N -b "next-auth.session-token=$TOKEN" -X POST "$BASE/api/jobs/abc123/cover-letter"
```

---

## Generation

### `POST /api/generate`

Validates job IDs before streaming. Use this to verify IDs exist before opening the SSE stream.

**Auth required:** yes

**Request body**

```json
{ "jobIds": ["abc123", "def456"] }
```

**Response — success (200)**

```json
{ "ok": true, "queued": ["abc123", "def456"] }
```

**Response — errors**

| Status | Body                                        |
|--------|---------------------------------------------|
| 400    | `{ "error": "jobIds must be non-empty array" }` |
| 400    | `{ "error": "Unknown job IDs: def456" }`    |

**curl**

```bash
curl -X POST -b "next-auth.session-token=$TOKEN" "$BASE/api/generate" \
  -H "Content-Type: application/json" \
  -d '{"jobIds":["abc123"]}'
```

---

### `GET /api/generate/:jobId/stream`

Runs the full resume generation pipeline for a single job and streams Server-Sent Events.

**Auth required:** yes (reads session user ID for AI provider config)

**Query params**

| Param       | Type   | Default     | Description                      |
|-------------|--------|-------------|----------------------------------|
| `sessionId` | string | `"default"` | Resume session to read data from |

**Response**

`Content-Type: text/event-stream`

Each SSE message is a JSON object:

```
data: {"stage":"llm","status":"ok","data":{...}}\n\n
```

Pipeline stages emitted (varies by run):

| `stage`       | `status`           | Notes                              |
|---------------|--------------------|------------------------------------|
| `"preflight"` | `"ok"` / `"fail"`  | Creates build directory, copies files, installs dependencies |
| `"ai-reason"` | `"ok"` / `"fail"`  | AI reasoning and selection         |
| `"write-script"` | `"ok"` / `"fail"`  | Generates Node.js build script   |
| `"build"`     | `"ok"` / `"fail"`  | DOCX build via `buildv2.js`        |
| `"validate"`  | `"ok"` / `"fail"`  | Hard limit validation              |
| `"fix-loop"`  | `"ok"` / `"fail"`  | Auto-fix overruns (up to 3 attempts) |
| `"pdf"`       | `"ok"` / `"fail"`  | PDF conversion (non-fatal)         |
| `"finalize"`  | `"ok"` / `"fail"`  | Move to output folder, update DB   |
| `"done"`      | `"ok"`             | Pipeline complete                  |
| `"error"`     | `"fail"`           | Unhandled error; `data.message` set |

**curl**

```bash
curl -N -b "next-auth.session-token=$TOKEN" \
  "$BASE/api/generate/abc123/stream?sessionId=default"
```

---

### `GET /api/generate/:jobId/download`

Downloads the DOCX for the most recent generation output. Redirects to presigned S3 URL in cloud mode.

**Auth required:** yes

**Response — success**

- `200 application/vnd.openxmlformats-officedocument.wordprocessingml.document`
  with `Content-Disposition: attachment` (local mode)
- `302` redirect to presigned S3 URL (cloud mode)

**Response — errors**

| Status | Body                                         | Reason                        |
|--------|----------------------------------------------|-------------------------------|
| 403    | `{ "error": "Invalid path" }`                | Path outside safe roots       |
| 404    | `{ "error": "No output found for this job" }` | No output record             |
| 404    | `{ "error": "DOCX file not found on disk" }` | File deleted after generation |
| 500    | `{ "error": "Could not generate download URL" }` | S3 presign failure        |

**curl**

```bash
curl -b "next-auth.session-token=$TOKEN" -L -o resume.docx \
  "$BASE/api/generate/abc123/download"
```

---

### `POST /api/generate/feedback`

Appends a feedback entry to `feedback/raw-log.md`. Trims the log to 100 entries when it exceeds 512 KB.

**Auth required:** yes

**Request body**

```json
{
  "jobId": "abc123",
  "outputId": "out-uuid",
  "rating": 2,
  "note": "Wrong project track selected — should have used systems not genai"
}
```

| Field      | Type        | Constraints                  |
|------------|-------------|------------------------------|
| `jobId`    | string      | Required                     |
| `outputId` | string      | Stored in log label only     |
| `rating`   | `1 \| 2 \| 3` | Required; 1=bad, 2=ok, 3=good |
| `note`     | string      | Optional; truncated to 200 chars |

**Response — success (200)**

```json
{ "ok": true }
```

**Response — error**

| Status | Body                                              |
|--------|---------------------------------------------------|
| 400    | `{ "error": "jobId and rating (1-3) required" }` |

**curl**

```bash
curl -X POST -b "next-auth.session-token=$TOKEN" "$BASE/api/generate/feedback" \
  -H "Content-Type: application/json" \
  -d '{"jobId":"abc123","outputId":"out-uuid","rating":2,"note":"Wrong variant"}'
```

---

## Batch

### `POST /api/batch/scan`

Scans the configured jobs directory for markdown files, parses each one, scores fit, and upserts into the database. Skips files whose `mtime` has not changed since the last scan.

**Auth required:** yes

**Request body**

None.

**Response — success (200)**

```json
{ "scanned": 12, "unchanged": 540, "skipped": 2 }
```

| Field       | Description                                         |
|-------------|-----------------------------------------------------|
| `scanned`   | Files parsed and upserted                           |
| `unchanged` | Files skipped because `mtime` matched DB record     |
| `skipped`   | Files that threw a parse error                      |

**Response — error**

| Status | Body                                                        | Reason                     |
|--------|-------------------------------------------------------------|----------------------------|
| 400    | `{ "error": "Jobs folder not found: ... Set it in Settings." }` | `jobs_path` not configured |

**curl**

```bash
curl -X POST -b "next-auth.session-token=$TOKEN" "$BASE/api/batch/scan"
```

---

## Metrics

### `GET /api/metrics`

Computes and returns pipeline metrics, then persists a snapshot to `jd_metrics`.

**Auth required:** yes

**Response — success (200)**

```json
{
  "total": 558,
  "visaKill": 43,
  "role_track_dist": {
    "genai": 210,
    "systems": 150,
    "IT-track": 40
  },
  "fit_dist": {
    "0-9": 5,
    "10-19": 12,
    "70-79": 95,
    "80-89": 120,
    "90-99": 60
  },
  "outputs": [
    {
      "id": "out-uuid",
      "job_id": "abc123",
      "docx_path": "...",
      "pdf_path": "...",
      "variant": "genai",
      "tagline": "...",
      "built_at": "2026-05-10T09:00:00.000Z",
      "company": "Acme Corp",
      "role_title": "Software Engineer",
      "role_track": "genai",
      "job_fit": 78
    }
  ],
  "pipeline": {
    "scraped": 558,
    "visa_kill": 43,
    "pending": 200,
    "resume_built": 315,
    "applied": 315,
    "interviewed": 42,
    "rejected": 18,
    "offer": 3
  }
}
```

`fit_dist` keys cover all 10-percentage-point buckets from `0-9` through `90-99`. Buckets with no jobs are included with a value of `0`.

**curl**

```bash
curl -b "next-auth.session-token=$TOKEN" "$BASE/api/metrics"
```

---

## Sessions

Sessions hold a snapshot of `master_resume_data.json` so you can generate resumes using different data variants without modifying the canonical file.

### `GET /api/sessions`

Lists all resume sessions, ordered by creation time. Ensures the `default` session exists.

**Auth required:** yes

**Response — success (200)**

```json
[
  {
    "id": "default",
    "name": "Default",
    "created_at": "2026-05-01T00:00:00.000Z",
    "updated_at": "2026-05-10T09:00:00.000Z"
  },
  {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "name": "iOS variant",
    "created_at": "2026-05-08T12:00:00.000Z",
    "updated_at": "2026-05-08T12:00:00.000Z"
  }
]
```

**curl**

```bash
curl -b "next-auth.session-token=$TOKEN" "$BASE/api/sessions"
```

---

### `POST /api/sessions`

Creates a new session by copying the current `default` session data.

**Auth required:** yes

**Request body**

```json
{ "name": "iOS variant" }
```

**Response — success (201)**

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "name": "iOS variant",
  "created_at": "2026-05-11T00:00:00.000Z",
  "updated_at": "2026-05-11T00:00:00.000Z"
}
```

**Response — error**

| Status | Body                        |
|--------|-----------------------------|
| 400    | `{ "error": "name required" }` |

**curl**

```bash
curl -X POST -b "next-auth.session-token=$TOKEN" "$BASE/api/sessions" \
  -H "Content-Type: application/json" \
  -d '{"name":"iOS variant"}'
```

---

### `GET /api/sessions/:id`

Returns a single session including its `data` (JSON string of resume profile).

**Auth required:** yes

**Response — success (200)**

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "name": "iOS variant",
  "data": "{\"work\":[...],\"projects\":[...],\"skills\":[...]}",
  "created_at": "2026-05-08T12:00:00.000Z",
  "updated_at": "2026-05-08T12:00:00.000Z"
}
```

**Response — error**

| Status | Body                      |
|--------|---------------------------|
| 404    | `{ "error": "Not found" }` |

**curl**

```bash
curl -b "next-auth.session-token=$TOKEN" "$BASE/api/sessions/550e8400-e29b-41d4-a716-446655440000"
```

---

### `PATCH /api/sessions/:id`

Renames a session. The `default` session cannot be renamed.

**Auth required:** yes

**Request body**

```json
{ "name": "New name" }
```

**Response — success (200)**

```json
{ "ok": true }
```

**Response — errors**

| Status | Body                                     | Reason                 |
|--------|------------------------------------------|------------------------|
| 400    | `{ "error": "name required" }`           | Missing `name`         |
| 403    | `{ "error": "Cannot rename default ..." }` | Attempt to rename default |

**curl**

```bash
curl -X PATCH -b "next-auth.session-token=$TOKEN" \
  "$BASE/api/sessions/550e8400-e29b-41d4-a716-446655440000" \
  -H "Content-Type: application/json" \
  -d '{"name":"Systems variant"}'
```

---

### `DELETE /api/sessions/:id`

Deletes a session. The `default` session cannot be deleted.

**Auth required:** yes

**Response — success (200)**

```json
{ "ok": true }
```

**Response — errors**

| Status | Body                                      | Reason                  |
|--------|-------------------------------------------|-------------------------|
| 403    | `{ "error": "Cannot delete default ..." }` | Attempt to delete default |

**curl**

```bash
curl -X DELETE -b "next-auth.session-token=$TOKEN" \
  "$BASE/api/sessions/550e8400-e29b-41d4-a716-446655440000"
```

---

### `POST /api/sessions/:id/promote`

Promotes a session by merging its data into the `default` session and syncing the master file on disk.

**Auth required:** yes

**Request body**

None.

**Response — success (200)**

```json
{ "ok": true }
```

**Response — error**

| Status | Body                   |
|--------|------------------------|
| 400    | `{ "error": "..." }`   |

**curl**

```bash
curl -X POST -b "next-auth.session-token=$TOKEN" \
  "$BASE/api/sessions/550e8400-e29b-41d4-a716-446655440000/promote"
```

---

## Profiles

Resume profiles are named snapshots of `master_resume_data.json`. Users can create and manage multiple profiles, with one marked as active for generation.

### `GET /api/profiles`

Lists all resume profiles for the authenticated user.

**Auth required:** yes

**Response — success (200)**

```json
[
  {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "name": "Default",
    "is_active": 1,
    "created_at": "2026-05-01T00:00:00.000Z"
  },
  {
    "id": "660f9501-f3ac-52e5-b827-557766551111",
    "name": "iOS variant",
    "is_active": 0,
    "created_at": "2026-05-08T12:00:00.000Z"
  }
]
```

**curl**

```bash
curl -b "next-auth.session-token=$TOKEN" "$BASE/api/profiles"
```

---

### `POST /api/profiles`

Creates a new resume profile.

**Auth required:** yes

**Request body**

```json
{
  "name": "iOS variant",
  "mode": "fork",
  "sourceProfileId": "550e8400-e29b-41d4-a716-446655440000"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Profile name (max 100 chars) |
| `mode` | string | Yes | Create mode: `fork`, `upload`, or `seed` |
| `sourceProfileId` | string | For `fork` | Profile to fork from |
| `jsonData` | object | For `upload` | Uploaded JSON object (profile data) |
| `setActive` | boolean | No | If `true`, mark as active after creation |

**Response — success (201)**

```json
{
  "id": "660f9501-f3ac-52e5-b827-557766551111",
  "name": "iOS variant",
  "is_active": 0,
  "created_at": "2026-05-08T12:00:00.000Z"
}
```

**Response — errors**

| Status | Body                                        | Reason                      |
|--------|---------------------------------------------|-----------------------------|
| 400    | `{ "error": "name required" }`              | Missing name                |
| 400    | `{ "error": "mode must be one of: ..." }`   | Invalid mode                |
| 400    | `{ "error": "sourceProfileId required" }`   | Fork mode but no source     |
| 400    | `{ "error": "Invalid JSON data" }`          | Upload mode with bad JSON   |

**curl**

```bash
curl -X POST -b "next-auth.session-token=$TOKEN" "$BASE/api/profiles" \
  -H "Content-Type: application/json" \
  -d '{"name":"iOS variant","mode":"fork","sourceProfileId":"550e8400-e29b-41d4-a716-446655440000"}'
```

---

### `GET /api/profiles/:id`

Returns a single profile including its `data` (profile JSON).

**Auth required:** yes

**Response — success (200)**

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "name": "Default",
  "data": "{\"work\":[...],\"projects\":[...],\"skills\":[...]}",
  "is_active": 1,
  "created_at": "2026-05-01T00:00:00.000Z"
}
```

**Response — error**

| Status | Body                      |
|--------|---------------------------|
| 404    | `{ "error": "Not found" }` |

**curl**

```bash
curl -b "next-auth.session-token=$TOKEN" "$BASE/api/profiles/550e8400-e29b-41d4-a716-446655440000"
```

---

### `PATCH /api/profiles/:id`

Updates profile name, data, or active status.

**Auth required:** yes

**Request body**

```json
{
  "name": "New name",
  "data": "{...}",
  "is_active": true
}
```

All fields are optional. `data` must be valid JSON if provided. Setting `is_active: true` deactivates other profiles.

**Response — success (200)**

```json
{ "ok": true }
```

**Response — errors**

| Status | Body                              | Reason                  |
|--------|-----------------------------------|-------------------------|
| 400    | `{ "error": "Invalid JSON data" }` | `data` is not valid JSON |
| 404    | `{ "error": "Not found" }`         | Profile does not exist  |

**curl**

```bash
# Rename
curl -X PATCH -b "next-auth.session-token=$TOKEN" "$BASE/api/profiles/550e8400-e29b-41d4-a716-446655440000" \
  -H "Content-Type: application/json" \
  -d '{"name":"Systems variant"}'

# Set active
curl -X PATCH -b "next-auth.session-token=$TOKEN" "$BASE/api/profiles/550e8400-e29b-41d4-a716-446655440000" \
  -H "Content-Type: application/json" \
  -d '{"is_active":true}'

# Update data
curl -X PATCH -b "next-auth.session-token=$TOKEN" "$BASE/api/profiles/550e8400-e29b-41d4-a716-446655440000" \
  -H "Content-Type: application/json" \
  -d '{"data":"{\"work\":[...],\"projects\":[...],\"skills\":[...]}"}'
```

---

### `DELETE /api/profiles/:id`

Deletes a profile. The last remaining profile cannot be deleted.

**Auth required:** yes

**Response — success (200)**

```json
{ "ok": true }
```

**Response — errors**

| Status | Body                                      | Reason                         |
|--------|-------------------------------------------|--------------------------------|
| 403    | `{ "error": "Cannot delete last profile" }` | Only profile remaining |
| 404    | `{ "error": "Not found" }`                | Profile does not exist         |

**curl**

```bash
curl -X DELETE -b "next-auth.session-token=$TOKEN" \
  "$BASE/api/profiles/550e8400-e29b-41d4-a716-446655440000"
```

---

## Settings

### `GET /api/settings`

Returns filesystem path settings. Unavailable in cloud mode.

**Auth required:** yes

**Response — success (200)**

```json
{
  "jobs_path": "/Users/you/JobData/Jobs",
  "output_path": "/Users/you/Desktop/Resumes",
  "jobs_path_exists": true,
  "output_path_exists": true
}
```

**Response — errors**

| Status | Body                                        | Reason       |
|--------|---------------------------------------------|--------------|
| 403    | `{ "error": "Not available in cloud mode" }` | Cloud deploy |

**curl**

```bash
curl -b "next-auth.session-token=$TOKEN" "$BASE/api/settings"
```

---

### `POST /api/settings`

Updates filesystem path settings. Unavailable in cloud mode.

**Auth required:** yes

**Request body**

```json
{
  "jobs_path": "/Users/you/JobData/Jobs",
  "output_path": "/Users/you/Desktop/Resumes"
}
```

Both fields are optional; only provided fields are updated.

**Response — success (200)**

```json
{
  "ok": true,
  "settings": {
    "jobs_path": "/Users/you/JobData/Jobs",
    "output_path": "/Users/you/Desktop/Resumes"
  }
}
```

**Response — errors**

| Status | Body                                        |
|--------|---------------------------------------------|
| 400    | `{ "error": "..." }`                        |
| 403    | `{ "error": "Not available in cloud mode" }` |

**curl**

```bash
curl -X POST -b "next-auth.session-token=$TOKEN" "$BASE/api/settings" \
  -H "Content-Type: application/json" \
  -d '{"jobs_path":"/Users/you/JobData/Jobs","output_path":"/Users/you/Desktop/Resumes"}'
```

---

### `GET /api/settings/ai`

Returns the current AI provider configuration for the authenticated user. API keys are not returned — only a masked hint.

**Auth required:** yes

**Response — success (200)**

```json
{
  "active_provider": "anthropic",
  "providers": ["anthropic","openai","google","groq","openrouter","ollama"],
  "default_models": {
    "anthropic": "claude-sonnet-4-6",
    "openai": "gpt-4o-mini",
    "google": "gemini-2.5-flash",
    "groq": "llama-3.3-70b-versatile",
    "openrouter": "anthropic/claude-3-haiku",
    "ollama": "gemma4:e2b"
  },
  "configs": [
    {
      "provider": "anthropic",
      "model": "claude-sonnet-4-6",
      "key_hint": "sk-ant-api03-••••••••••••••••"
    }
  ]
}
```

**curl**

```bash
curl -b "next-auth.session-token=$TOKEN" "$BASE/api/settings/ai"
```

---

### `POST /api/settings/ai`

Saves an AI provider configuration and optionally sets it as the active provider. Performs a live key test before saving.

Rate-limited to 10 requests per IP per minute.

**Auth required:** yes

**Request body**

```json
{
  "provider": "anthropic",
  "api_key": "sk-ant-api03-...",
  "model": "claude-sonnet-4-6",
  "base_url": null,
  "set_active": true
}
```

| Field        | Type    | Required | Notes                                                              |
|--------------|---------|----------|--------------------------------------------------------------------|
| `provider`   | string  | Yes      | One of: `anthropic openai google groq openrouter ollama`          |
| `api_key`    | string  | Yes (not ollama) | Max 500 chars; must match provider key prefix              |
| `model`      | string  | No       | Defaults to provider default; alphanumeric/`_-:/. ` only, max 100 chars |
| `base_url`   | string  | No (ollama) | Ollama only; must be localhost or RFC-1918 address            |
| `set_active` | boolean | No       | If `true`, sets this provider as active after saving              |

Valid key prefixes:

| Provider    | Prefix         |
|-------------|----------------|
| anthropic   | `sk-ant-`      |
| openai      | `sk-` (not `sk-ant-` or `sk-or-`) |
| google      | `AIza`         |
| groq        | `gsk_`         |
| openrouter  | `sk-or-`       |
| ollama      | (no key needed) |

**Response — success (200)**

```json
{ "ok": true, "key_hint": "sk-ant-api03-••••••••••••••••" }
```

**Response — errors**

| Status | Body                                             | Reason                         |
|--------|--------------------------------------------------|--------------------------------|
| 400    | `{ "error": "provider must be one of: ..." }`   | Unknown provider               |
| 400    | `{ "error": "Key format invalid for anthropic" }` | Wrong key prefix              |
| 400    | `{ "error": "API key rejected — check the key and try again" }` | Live test 401 |
| 400    | `{ "error": "Model not found for this provider ..." }` | Live test 404           |
| 400    | `{ "error": "Could not connect to provider ..." }` | ECONNREFUSED / timeout      |
| 400    | `{ "error": "base_url must be a local or private-network address ..." }` | SSRF guard |
| 429    | `{ "error": "Too many requests — wait a minute" }` | Rate limit hit              |

**curl**

```bash
# Anthropic
curl -X POST -b "next-auth.session-token=$TOKEN" "$BASE/api/settings/ai" \
  -H "Content-Type: application/json" \
  -d '{"provider":"anthropic","api_key":"sk-ant-api03-...","model":"claude-sonnet-4-6","set_active":true}'

# Ollama (no API key)
curl -X POST -b "next-auth.session-token=$TOKEN" "$BASE/api/settings/ai" \
  -H "Content-Type: application/json" \
  -d '{"provider":"ollama","model":"gemma4:e2b","base_url":"http://localhost:11434/v1","set_active":true}'
```

---

### `DELETE /api/settings/ai`

Removes the stored configuration for a provider.

**Auth required:** yes

**Query params**

| Param      | Type   | Description              |
|------------|--------|--------------------------|
| `provider` | string | Required. Provider name. |

**Response — success (200)**

```json
{ "ok": true }
```

**curl**

```bash
curl -X DELETE -b "next-auth.session-token=$TOKEN" \
  "$BASE/api/settings/ai?provider=anthropic"
```

---

### `PATCH /api/settings/ai`

Sets the active provider without changing credentials.

**Auth required:** yes

**Request body**

```json
{ "provider": "openai" }
```

**Response — success (200)**

```json
{ "ok": true }
```

**curl**

```bash
curl -X PATCH -b "next-auth.session-token=$TOKEN" "$BASE/api/settings/ai" \
  -H "Content-Type: application/json" \
  -d '{"provider":"openai"}'
```

---

### `GET /api/settings/ai/ollama-models`

Fetches the list of locally available Ollama models from the Ollama server.

**Auth required:** yes

**Query params**

| Param      | Type   | Default                          | Description                                    |
|------------|--------|----------------------------------|------------------------------------------------|
| `base_url` | string | `http://localhost:11434/v1`      | Must be localhost or RFC-1918 address (SSRF guard) |

**Response — success (200)**

```json
{ "models": ["gemma4:e2b", "llama3.2:3b", "mistral:7b"] }
```

**Response — errors**

| Status | Body                                                       | Reason                    |
|--------|------------------------------------------------------------|---------------------------|
| 400    | `{ "error": "base_url must be a local or private-network address" }` | SSRF guard   |
| 502    | `{ "error": "Ollama returned 404 — is the server running?" }` | Ollama HTTP error      |
| 502    | `{ "error": "Could not connect to Ollama — is the server running?" }` | ECONNREFUSED / timeout |

**curl**

```bash
curl -b "next-auth.session-token=$TOKEN" \
  "$BASE/api/settings/ai/ollama-models?base_url=http://localhost:11434/v1"
```

---

## Chat

The chat API provides an AI assistant for editing the resume profile (`master_resume_data.json` and related files). It uses Anthropic's streaming Messages API with tool use.

### `POST /api/chat`

Sends a message to the profile editor assistant and streams the response as Server-Sent Events.

The assistant may call two tools internally:
- `read_file` — reads a known file (`master_resume_data`, `claude_full`, `ats_guidelines`, `ats_system`, `spec`)
- `propose_edit` — proposes a file edit; stores it as a pending edit and emits a `diff` event

The route runs up to 8 tool-use loops before terminating.

**Auth required:** yes (reads Anthropic client from user provider config)

**Request body**

```json
{ "sessionId": "my-chat-session-id", "message": "Update the tagline for the systems track" }
```

| Field       | Type   | Description                              |
|-------------|--------|------------------------------------------|
| `sessionId` | string | Arbitrary string; scopes chat history    |
| `message`   | string | User message                             |

**Response**

`Content-Type: text/event-stream`

SSE event types:

| `type`   | Additional fields         | Description                                  |
|----------|---------------------------|----------------------------------------------|
| `text`   | `delta: string`           | Streamed text token from the assistant        |
| `diff`   | `file`, `description`, `diff` | Edit proposed; awaiting `/api/chat/apply` |
| `done`   |                           | Stream complete                               |
| `error`  | `message: string`         | Unhandled error                              |

**curl**

```bash
curl -N -X POST -b "next-auth.session-token=$TOKEN" "$BASE/api/chat" \
  -H "Content-Type: application/json" \
  -d '{"sessionId":"my-session","message":"Improve the carboncopies bullet 3"}'
```

---

### `POST /api/chat/apply`

Accepts or rejects a pending edit proposed by the chat assistant.

**Auth required:** yes

**Request body**

```json
{
  "sessionId": "my-chat-session-id",
  "accept": true,
  "file": "master_resume_data"
}
```

| Field       | Type    | Description                                                    |
|-------------|---------|----------------------------------------------------------------|
| `sessionId` | string  | Chat session ID that holds the pending edit                    |
| `accept`    | boolean | `true` to apply, `false` to discard                           |
| `file`      | string  | File key: `master_resume_data`, `claude_full`, `ats_guidelines`, `ats_system`, or `spec` |

**Response — success (200)**

```json
{ "ok": true, "applied": true, "file": "master_resume_data" }
```

Or when rejected:

```json
{ "ok": true, "applied": false }
```

**Response — errors**

| Status | Body                                        | Reason                           |
|--------|---------------------------------------------|----------------------------------|
| 400    | `{ "error": "sessionId and file required" }` | Missing fields                  |
| 400    | `{ "error": "Unknown file" }`               | `file` not in allowed set        |
| 404    | `{ "error": "No pending edit" }`            | No pending edit for session+file |
| 422    | `{ "error": "Invalid JSON in proposed content" }` | JSON parse failed for `master_resume_data` |

**curl**

```bash
# Accept
curl -X POST -b "next-auth.session-token=$TOKEN" "$BASE/api/chat/apply" \
  -H "Content-Type: application/json" \
  -d '{"sessionId":"my-session","accept":true,"file":"master_resume_data"}'

# Reject
curl -X POST -b "next-auth.session-token=$TOKEN" "$BASE/api/chat/apply" \
  -H "Content-Type: application/json" \
  -d '{"sessionId":"my-session","accept":false,"file":"master_resume_data"}'
```

---

### `GET /api/chat/sessions`

Lists the 50 most recent chat sessions with metadata.

**Auth required:** yes

**Response — success (200)**

```json
[
  {
    "session_id": "my-chat-session-id",
    "started_at": "2026-05-10T08:00:00.000Z",
    "last_at": "2026-05-10T09:30:00.000Z",
    "first_message": "Update the tagline for the systems track"
  }
]
```

**curl**

```bash
curl -b "next-auth.session-token=$TOKEN" "$BASE/api/chat/sessions"
```

---

### `GET /api/chat/sessions/:id`

Returns the message history for a chat session (user and assistant turns only; tool turns excluded). Limited to 50 messages.

**Auth required:** yes

**Response — success (200)**

```json
[
  {
    "role": "user",
    "content": "Update the tagline for the systems track",
    "tool_calls": null,
    "created_at": "2026-05-10T08:00:00.000Z"
  },
  {
    "role": "assistant",
    "content": "I'll read the file first.",
    "tool_calls": null,
    "created_at": "2026-05-10T08:00:01.000Z"
  }
]
```

**curl**

```bash
curl -b "next-auth.session-token=$TOKEN" "$BASE/api/chat/sessions/my-chat-session-id"
```

---

## GitHub

### `POST /api/github/ingest`

Fetches a GitHub repository, summarizes it with AI, and returns a project entry formatted for `master_resume_data.json`.

**Auth required:** yes (reads AI provider for user)

**Request body**

```json
{ "url": "https://github.com/vietbui1999ru/HomeBoard" }
```

URL must be a valid `github.com/owner/repo` URL, max 300 characters.

**Response — success (200)**

```json
{
  "id": "homeBoard",
  "name": "HomeBoard",
  "short_stack": "ASP.NET Core, C#, React, PostgreSQL",
  "bullets": [
    "Built task management API using ASP.NET Core 8 and C#, achieving sub-100ms p99 latency",
    "..."
  ]
}
```

**Response — errors**

| Status | Body                                     | Reason                    |
|--------|------------------------------------------|---------------------------|
| 400    | `{ "error": "url required" }`            | Missing URL               |
| 400    | `{ "error": "URL too long (max 300 chars)" }` | URL exceeds limit    |
| 400    | `{ "error": "Invalid GitHub URL" }`      | Not a `github.com` URL    |
| 404    | `{ "error": "Repo not found or private" }` | GitHub 404              |
| 500    | `{ "error": "Failed to fetch repository" }` | Network or parse error |

**curl**

```bash
curl -X POST -b "next-auth.session-token=$TOKEN" "$BASE/api/github/ingest" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://github.com/vietbui1999ru/HomeBoard"}'
```

---

### `POST /api/github/apply`

Upserts a generated project entry into `master_resume_data.json` (via the default session and active session).

**Auth required:** yes

**Request body**

```json
{
  "project": {
    "id": "homeBoard",
    "name": "HomeBoard",
    "short_stack": "ASP.NET Core, C#, React, PostgreSQL",
    "bullets": [
      "Built task management API using ASP.NET Core 8 and C#, achieving sub-100ms p99 latency"
    ]
  },
  "sessionId": "default"
}
```

| Field              | Constraints                                              |
|--------------------|----------------------------------------------------------|
| `project.id`       | Required; lowercase alphanumeric, dashes/underscores, max 40 chars |
| `project.bullets`  | Required; non-empty array of strings each ≤116 chars    |
| `sessionId`        | Optional; defaults to `"default"`                       |

**Response — success (200)**

```json
{ "ok": true, "replaced": false }
```

`replaced` is `true` if a project with the same `id` already existed and was overwritten.

**Response — errors**

| Status | Body                                                         | Reason                      |
|--------|--------------------------------------------------------------|-----------------------------|
| 400    | `{ "error": "project with id and bullets required" }`        | Missing fields              |
| 400    | `{ "error": "project.id must be lowercase alphanumeric ..." }` | ID format violation       |
| 400    | `{ "error": "bullets must be strings each ≤116 chars" }`     | Bullet too long or wrong type |

**curl**

```bash
curl -X POST -b "next-auth.session-token=$TOKEN" "$BASE/api/github/apply" \
  -H "Content-Type: application/json" \
  -d '{
    "project": {
      "id": "homeBoard",
      "name": "HomeBoard",
      "short_stack": "ASP.NET Core, C#, React, PostgreSQL",
      "bullets": ["Built REST API with ASP.NET Core 8 serving 500+ daily users"]
    },
    "sessionId": "default"
  }'
```

---

## Config

These endpoints give raw read/write access to the pipeline configuration files. `buildv2.js` is readable but not writable via HTTP.

### `GET /api/config/read`

Returns the content of a known pipeline or docs file.

**Auth required:** yes

**Query params**

| Param  | Type   | Description         |
|--------|--------|---------------------|
| `file` | string | Required. See table below. |

Allowed file names:

| `file`                              | Description                          |
|-------------------------------------|--------------------------------------|
| `buildv2.js`                        | DOCX build engine (read-only)        |
| `master_resume_data.json`           | Canonical resume profile data        |
| `ats-optimized-resume-system.md`    | ATS system prompt                    |
| `ats-optimization-guidelines.md`    | ATS optimization guidelines          |
| `CLAUDE-full.md`                    | Full resume generation rules         |
| `spec-job-match-resume-generator.md` | Job match spec                      |

**Response — success (200)**

```json
{ "content": "..." }
```

**Response — error**

| Status | Body                      |
|--------|---------------------------|
| 400    | `{ "error": "Unknown file" }` |

**curl**

```bash
curl -b "next-auth.session-token=$TOKEN" \
  "$BASE/api/config/read?file=master_resume_data.json"
```

---

### `POST /api/config/write`

Overwrites a known pipeline or docs file. JSON files are validated before writing. A `.bak` backup is created automatically.

Note: `buildv2.js` is excluded from writes to prevent remote code execution.

**Auth required:** yes

**Request body**

```json
{ "file": "master_resume_data.json", "content": "{...}" }
```

**Response — success (200)**

```json
{ "ok": true, "backup": "/path/to/master_resume_data.json.bak" }
```

**Response — errors**

| Status | Body                                | Reason                          |
|--------|-------------------------------------|---------------------------------|
| 400    | `{ "error": "Unknown file" }`       | `file` not in writable set      |
| 400    | `{ "error": "Invalid JSON" }`       | JSON parse failed for `.json` files |
| 400    | `{ "error": "Syntax error: ..." }`  | Node.js syntax check failed for `.js` files |

**curl**

```bash
curl -X POST -b "next-auth.session-token=$TOKEN" "$BASE/api/config/write" \
  -H "Content-Type: application/json" \
  -d '{"file":"ats-optimization-guidelines.md","content":"# Updated guidelines\n..."}'
```

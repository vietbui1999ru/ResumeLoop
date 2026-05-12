---
title: "Testing Guide"
description: "How to run unit tests and manually test API endpoints with curl."
sidebar_position: 1
tags: [testing, curl, api, vitest]
updated: 2026-05-11
---

# Testing Guide

This guide covers two levels of testing: unit tests via Vitest and manual API testing with curl.

---

## 1. Unit Tests

### Running tests

```bash
# Run all tests (watch mode)
npx vitest

# Single run, no watch
npx vitest run

# Run a specific file
npx vitest run lib/fit-scorer.test.ts
```

Tests use Vitest and run against an in-memory SQLite database where applicable. No server needs to be running.

### Test files and coverage

| File | What it covers |
|------|----------------|
| `lib/fit-scorer.test.ts` | `scoreJd()` — keyword-based role track detection and fit percentage scoring |
| `lib/jd-parser.test.ts` | `parseJd()` — frontmatter extraction, company/role parsing, visa status detection from file content |
| `lib/get-metrics.test.ts` | `computeMetrics()` — pipeline stage counts against a real in-memory SQLite DB; uses `SqliteAdapter` directly |
| `lib/db.test.ts` | `initSchema()` — verifies that schema initialization creates all expected tables and columns |
| `lib/chat-tools.test.ts` | `handleReadFile()` / `handleProposeEdit()` — known file keys resolve, unknown keys return error strings; `CHAT_TOOLS` exports exactly two tools |
| `lib/github-ingest.test.ts` | `parseGithubUrl()` — GitHub URL parsing, `.git` suffix stripping, non-GitHub URL rejection; `validateBullets()` — 116-char truncation at word boundary |
| `lib/ai-reason.test.ts` | `runReasoning()` — mocks the Anthropic SDK; verifies the resume decision tool is called and the structured output (track, workVariant, projects, tagline, skillsRows) is returned correctly |
| `lib/prompt-context.test.ts` | `buildSystemPrompt()` — mocks `fs`; verifies master data, CLAUDE-full rules, and ATS guidelines are all included in the assembled prompt |
| `lib/tag-filter.test.ts` | `extractAllTags()` — deduplication and sorting; `jobMatchesTagFilter()` — empty filter always matches, specific tag filter matches correctly |

---

## 2. Manual API Testing with curl

### Base setup

```bash
BASE=http://localhost:3000
```

### Getting a session cookie

1. Open the app in your browser at `http://localhost:3000`.
2. Sign in (or use the demo account: `demo@demo.com` / `password`).
3. Open DevTools → Application tab → Cookies → `http://localhost:3000`.
4. Copy the value of `next-auth.session-token`.

```bash
TOKEN=<paste-value-here>
```

All authenticated requests below use `-b "next-auth.session-token=$TOKEN"`.

---

### Health check (no auth)

```bash
curl "$BASE/api/health"
# {"ok":true,"ts":1715433600000}
```

---

### List jobs

```bash
curl -b "next-auth.session-token=$TOKEN" "$BASE/api/jobs"
```

With a search filter:

```bash
curl -b "next-auth.session-token=$TOKEN" "$BASE/api/jobs?q=backend"
```

---

### Get job detail

```bash
JOB_ID=abc123   # replace with a real ID from the list above

curl -b "next-auth.session-token=$TOKEN" "$BASE/api/jobs/$JOB_ID"
```

---

### Trigger a scan

Reads from the `jobs_path` configured in Settings and upserts changed files into the database.

```bash
curl -X POST -b "next-auth.session-token=$TOKEN" "$BASE/api/batch/scan"
# {"scanned":12,"unchanged":540,"skipped":0}
```

If this returns a 400, the jobs folder path has not been configured. Set it first:

```bash
curl -X POST -b "next-auth.session-token=$TOKEN" "$BASE/api/settings" \
  -H "Content-Type: application/json" \
  -d '{"jobs_path":"/Users/you/JobData/Jobs","output_path":"/Users/you/Desktop/Resumes"}'
```

---

### Start a generation stream (SSE)

The generation stream uses Server-Sent Events. `-N` disables curl's buffering so you see events as they arrive.

```bash
curl -N -b "next-auth.session-token=$TOKEN" \
  "$BASE/api/generate/$JOB_ID/stream?sessionId=default"
```

Each line will look like:

```
data: {"stage":"llm","status":"ok","data":{"track":"systems","tagline":"..."}}

data: {"stage":"build","status":"ok","data":{"docx_path":"/path/to/resume.docx"}}

data: {"stage":"save","status":"ok","data":{}}
```

If the AI provider is not configured you will receive:

```
data: {"type":"error","message":"No API key configured for provider: anthropic"}
```

---

### Get generation output for a job

```bash
curl -b "next-auth.session-token=$TOKEN" "$BASE/api/jobs/$JOB_ID/output"
```

---

### Download the generated DOCX

```bash
curl -b "next-auth.session-token=$TOKEN" -L -o resume.docx \
  "$BASE/api/generate/$JOB_ID/download"
```

`-L` follows the redirect that occurs in cloud (S3 presigned URL) mode.

---

### Preview the PDF

```bash
curl -b "next-auth.session-token=$TOKEN" -L -o preview.pdf \
  "$BASE/api/jobs/$JOB_ID/preview"
```

---

### Generate a cover letter (streaming)

```bash
curl -N -X POST -b "next-auth.session-token=$TOKEN" \
  "$BASE/api/jobs/$JOB_ID/cover-letter"
```

Plain text is streamed directly. The completed text is also persisted to `jd_outputs.cover_letter`.

---

### List resume sessions

```bash
curl -b "next-auth.session-token=$TOKEN" "$BASE/api/sessions"
```

---

### Get metrics

Computes and returns pipeline metrics, then writes a snapshot to the database.

```bash
curl -b "next-auth.session-token=$TOKEN" "$BASE/api/metrics"
```

---

### Configure an AI provider

```bash
# Anthropic
curl -X POST -b "next-auth.session-token=$TOKEN" "$BASE/api/settings/ai" \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "anthropic",
    "api_key": "sk-ant-api03-...",
    "model": "claude-sonnet-4-6",
    "set_active": true
  }'

# Ollama (no API key required)
curl -X POST -b "next-auth.session-token=$TOKEN" "$BASE/api/settings/ai" \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "ollama",
    "model": "gemma4:e2b",
    "base_url": "http://localhost:11434/v1",
    "set_active": true
  }'
```

The endpoint runs a live key test before saving. If the test fails you will receive a descriptive error.

---

### Fetch available Ollama models

```bash
curl -b "next-auth.session-token=$TOKEN" \
  "$BASE/api/settings/ai/ollama-models?base_url=http://localhost:11434/v1"
# {"models":["gemma4:e2b","llama3.2:3b"]}
```

---

## 3. Common Errors and What They Mean

### `401 Unauthorized`

You are not logged in, or your session cookie has expired. Sign in through the UI and copy a fresh `next-auth.session-token` value from DevTools.

---

### `403 Not available in cloud mode`

You are hitting `/api/settings` (filesystem paths) in a deployment that uses Neon Postgres (cloud mode). These endpoints only work in local mode where the server has direct filesystem access.

### `403 Invalid path`

The PDF or DOCX path stored in the database points outside the allowed safe roots (`~/Desktop`, `~/Documents`, `~/Downloads`, or `cwd()`). This is a path traversal guard. Regenerate the resume from scratch to get a new path within a safe root.

---

### `404 Not found`

The job ID does not exist in the database. Either the scan has not been run yet, or you are using a stale ID. Run `POST /api/batch/scan` to refresh, then re-list jobs.

For `/api/jobs/:id/output` or `/api/jobs/:id/preview`, the job exists but has no generation output yet. Run the generation stream first.

---

### `502 Bad Gateway` (Ollama)

The Ollama server is not running or is not reachable at the configured `base_url`.

Check that Ollama is running:

```bash
curl http://localhost:11434/api/tags
```

If it returns a connection refused error, start Ollama:

```bash
ollama serve
```

If it is running but models are missing:

```bash
ollama pull gemma4:e2b
```

---

### `400 No API key configured`

No AI provider has been configured for your user. Use `POST /api/settings/ai` to add a provider, then set it active.

---

### `429 Too many requests`

The `/api/settings/ai` POST endpoint is rate-limited to 10 requests per IP per minute. Wait 60 seconds and retry.

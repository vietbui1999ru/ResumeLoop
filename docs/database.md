---
title: "Database Reference"
description: "Schema, migrations, and operational guide for ResumeLoop's SQLite (local) and Neon Postgres (cloud) databases."
tags: [database, sqlite, neon, postgres, schema]
updated: 2026-05-11
---

# Database Reference

ResumeLoop uses two database backends selected by the `APP_MODE` environment variable:

- **Local** (`APP_MODE` unset): `better-sqlite3`, file at `resume.db` in the project root
- **Cloud** (`APP_MODE=cloud`): Neon serverless Postgres via `@neondatabase/serverless`

Both backends implement the `DbAdapter` interface in `lib/db-adapter.ts` and expose the same `query`, `queryOne`, `run`, and `exec` methods. Application code calls `getAdapter()` and does not branch on the database type.

---

## Local SQLite

### File location

```
<project-root>/resume.db
```

Override with the `DB_PATH` environment variable (relative to `cwd`):

```bash
DB_PATH=./data/resume.db npm run dev
```

In Docker, `resume.db` is bind-mounted from the host so it persists across container rebuilds:

```yaml
# docker-compose.yml
volumes:
  - ./resume.db:/app/resume.db
```

### Inspect the database

```bash
sqlite3 resume.db

# List tables
.tables

# Describe a table
.schema jd_jobs

# Exit
.quit
```

### Configuration

`lib/db.ts` sets two pragmas on every connection:

```sql
PRAGMA journal_mode = WAL;   -- Write-Ahead Logging: concurrent reads during writes
PRAGMA foreign_keys = ON;    -- Enforce REFERENCES constraints
```

### Backup and restore

```bash
# Backup
cp resume.db resume.db.backup

# Restore
cp resume.db.backup resume.db
```

### Reset

Delete `resume.db` and restart the development server. `initSchema` recreates all tables and seeds the demo user on startup.

```bash
rm resume.db
npm run dev
```

---

## Migrations

There is no migration tool. `initSchema` in `lib/db.ts` runs on every startup and is idempotent.

New columns added after initial release are guarded with an existence check before `ALTER TABLE`:

```typescript
const hasColumn = (db.prepare(
  `SELECT COUNT(*) as c FROM pragma_table_info('table_name') WHERE name='col_name'`
).get() as { c: number }).c > 0

if (!hasColumn) db.exec(`ALTER TABLE table_name ADD COLUMN col_name TEXT`)
```

This means you can upgrade by simply restarting — the schema catches up automatically. Columns are never dropped or renamed via migrations; old columns are left in place.

**Current migration guards** (columns added after initial schema):

| Table | Column | Notes |
|---|---|---|
| `jd_outputs` | `session_id` | Links output to a resume session |
| `jd_outputs` | `reasoning` | LLM reasoning text for resume decisions |
| `jd_outputs` | `pdf_path` | Path/key for generated PDF |
| `jd_outputs` | `cover_letter` | Generated cover letter text |
| `jd_jobs` | `file_mtime` | Source file last-modified timestamp |
| `jd_jobs` | `action` | Pipeline action flag |
| `jd_jobs` | `outreach_brief` | AI-generated outreach brief |
| `jd_jobs` | `clipped_at` | Obsidian clip date from frontmatter |
| `jd_jobs` | `apply_url` | URL to application form |
| `jd_jobs` | `hidden` | Hidden flag (0 or 1) |
| `user_settings` | whole table | Added after initial release |
| `ai_usage_log` | whole table | Added after initial release |
| `users` | whole table | Added after initial release |
| `outreach_items` | whole table | Added after initial release |
| `resume_profiles` | whole table | Named resume profile variants |
| `jd_jobs`, `jd_outputs`, `jd_metrics`, `chat_messages`, `resume_sessions` | `user_id` | Multi-tenancy column added after initial release |

---

## Schema

### `jd_jobs`

Stores one row per scanned job description file.

| Column | Type | Description |
|---|---|---|
| `id` | TEXT PK | Derived from the JD file path |
| `file_path` | TEXT NOT NULL | Absolute path to the JD markdown file |
| `company` | TEXT | Company name (extracted from frontmatter) |
| `role_title` | TEXT | Job title |
| `tags` | TEXT | Comma-separated frontmatter tags (e.g. `resume-ed`, `visa-kill`) |
| `visa_status` | TEXT | Result of visa check: `proceed`, `visa-kill`, or `export-control` |
| `role_track` | TEXT | Resolved role track (e.g. `genai`, `systems`, `IT-track`) |
| `fit_pct` | INTEGER | Estimated fit percentage (0–100) |
| `raw_content` | TEXT | Full markdown content of the JD file |
| `file_mtime` | TEXT | ISO timestamp of file last-modified (for change detection) |
| `clipped_at` | TEXT | ISO timestamp from Obsidian `created:` frontmatter (stable clip date) |
| `outreach_brief` | TEXT | AI-generated outreach brief for this job |
| `action` | TEXT | Pending action (e.g. `re-scan`) |
| `apply_url` | TEXT | URL to job application form (user-editable) |
| `hidden` | INTEGER DEFAULT 0 | Hidden flag: 0 = visible, 1 = hidden |
| `user_id` | TEXT NOT NULL | Owning user (`DEFAULT 'default'`) |
| `scanned_at` | DATETIME | When the row was last written |

---

### `jd_outputs`

Stores one row per generated resume output. A single job can have multiple outputs (different variants or regenerations).

| Column | Type | Description |
|---|---|---|
| `id` | TEXT PK | UUID |
| `job_id` | TEXT NOT NULL → `jd_jobs(id)` | Parent job |
| `docx_path` | TEXT | Local path or S3 key for the DOCX file |
| `pdf_path` | TEXT | Local path or S3 key for the PDF file |
| `projects_used` | TEXT | JSON array of project IDs selected |
| `work_ids_used` | TEXT | JSON array of work IDs selected |
| `variant` | TEXT | Work track used: `genai`, `systems`, or `IT-track` |
| `tagline` | TEXT | Generated tagline (≤76 chars) |
| `reasoning` | TEXT | LLM explanation of selection decisions |
| `cover_letter` | TEXT | Generated cover letter text |
| `session_id` | TEXT | Links to `resume_sessions(id)` if generated in a session |
| `user_id` | TEXT NOT NULL | Owning user (`DEFAULT 'default'`) |
| `built_at` | DATETIME | Generation timestamp |

Note: The `session_id` reference to `resume_sessions(id)` is a logical reference only — no FK constraint is enforced in the schema.

---

### `jd_metrics`

Aggregate statistics snapshot. Not keyed — appended on each metrics computation.

| Column | Type | Description |
|---|---|---|
| `computed_at` | DATETIME | When the snapshot was taken |
| `total_jobs` | INTEGER | Total jobs in `jd_jobs` |
| `visa_kill_count` | INTEGER | Count of `visa_status = 'visa-kill'` |
| `role_track_dist` | TEXT | JSON object: `{track: count, ...}` |
| `fit_dist` | TEXT | JSON object: fit percentage distribution |

---

### `app_settings`

Key-value store for application configuration (e.g. folder paths set via the /config UI).

| Column | Type | Description |
|---|---|---|
| `key` | TEXT PK | Setting name |
| `value` | TEXT NOT NULL | Setting value |

---

### `chat_messages`

Stores the conversation history for AI chat sessions.

| Column | Type | Description |
|---|---|---|
| `id` | TEXT PK | UUID |
| `session_id` | TEXT NOT NULL | Groups messages into a conversation |
| `role` | TEXT NOT NULL | `user`, `assistant`, or `tool` |
| `content` | TEXT | Message text content |
| `tool_calls` | TEXT | JSON-serialized tool call objects (assistant turns) |
| `user_id` | TEXT NOT NULL | Owning user (`DEFAULT 'default'`) |
| `created_at` | DATETIME | Message timestamp |

Indexed on `(session_id, created_at)` for efficient retrieval of ordered conversation history.

---

### `resume_sessions`

Named resume-building sessions. Each session can accumulate multiple outputs.

| Column | Type | Description |
|---|---|---|
| `id` | TEXT PK | UUID |
| `name` | TEXT NOT NULL | Human-readable session name |
| `data` | TEXT NOT NULL | JSON blob of session state, defaults to `{}` |
| `user_id` | TEXT NOT NULL | Owning user (`DEFAULT 'default'`) |
| `created_at` | DATETIME | Creation timestamp |
| `updated_at` | DATETIME | Last update timestamp |

---

### `resume_profiles`

Named resume profile variants — snapshots of `master_resume_data.json`.

| Column | Type | Description |
|---|---|---|
| `id` | TEXT PK | UUID |
| `user_id` | TEXT NOT NULL | Owning user |
| `name` | TEXT NOT NULL | Human-readable profile name |
| `data` | TEXT NOT NULL | JSON blob of profile data (resume bullets, projects, skills, etc.) |
| `is_active` | INTEGER DEFAULT 0 | Active flag: 0 = inactive, 1 = active. Only one profile per user is active. |
| `created_at` | DATETIME | Creation timestamp |

---

### `user_settings`

Per-user, per-provider LLM API key and model configuration. API keys are encrypted with `ENCRYPTION_KEY` before storage.

| Column | Type | Description |
|---|---|---|
| `user_id` | TEXT | References `users(id)` |
| `provider` | TEXT | LLM provider name (e.g. `openai`, `anthropic`) |
| `encrypted_key` | TEXT NOT NULL | AES-encrypted API key |
| `model` | TEXT NOT NULL | Selected model name |
| `base_url` | TEXT | Optional custom base URL for the provider |
| `updated_at` | DATETIME | Last update timestamp |

Primary key is `(user_id, provider)`.

---

### `ai_usage_log`

Token usage log for AI feature calls. Used for cost tracking.

| Column | Type | Description |
|---|---|---|
| `id` | INTEGER PK (SQLite) / BIGINT IDENTITY PK (Neon) | Auto-increment |
| `user_id` | TEXT NOT NULL | User who triggered the call |
| `provider` | TEXT NOT NULL | LLM provider |
| `model` | TEXT NOT NULL | Model name |
| `feature` | TEXT NOT NULL | Feature that made the call (e.g. `chat`, `generate`, `tagline`) |
| `input_tok` | INTEGER NOT NULL | Input token count |
| `output_tok` | INTEGER NOT NULL | Output token count |
| `created_at` | DATETIME | Timestamp |

---

### `outreach_items`

One row per outreach contact (person or company) associated with a job.

| Column | Type | Description |
|---|---|---|
| `id` | TEXT PK | UUID |
| `job_id` | TEXT NOT NULL → `jd_jobs(id)` | Parent job |
| `user_id` | TEXT NOT NULL | Owning user |
| `kind` | TEXT NOT NULL | `person` or `company` |
| `raw_markdown` | TEXT NOT NULL | Source file content as imported |
| `ai_card` | TEXT | JSON AI-generated contact summary |
| `role` | TEXT | Contact role enum (e.g. `hiring_manager`, `recruiter`, `engineer`) |
| `role_custom` | TEXT | Free-text role override when `role = 'other'` |
| `notes` | TEXT | User notes |
| `email` | TEXT | Contact email address |
| `status` | TEXT NOT NULL | `not_contacted`, `contacted`, `replied`, `no_response` |
| `linkedin_draft` | TEXT | AI-generated LinkedIn message draft |
| `email_draft` | TEXT | AI-generated email draft |
| `source_path` | TEXT | Path to the source `.md` file in the vault |
| `created_at` | TEXT NOT NULL | ISO timestamp |
| `updated_at` | TEXT NOT NULL | ISO timestamp |

---

### `users`

User accounts. Passwords are bcrypt-hashed (cost factor 10).

| Column | Type | Description |
|---|---|---|
| `id` | TEXT PK | UUID (or `demo-user` for the seeded demo account) |
| `email` | TEXT UNIQUE NOT NULL | Login email |
| `password` | TEXT NOT NULL | bcrypt hash |
| `is_demo` | INTEGER NOT NULL | `1` for the seeded demo account, `0` for real users |
| `created_at` | DATETIME | Account creation timestamp |

A demo user (`demo@demo.com` / `demo`) is seeded automatically on first startup.

---

## Cloud Neon (Postgres)

### Create a Neon project

1. Go to [neon.tech](https://neon.tech) → New Project
2. Choose region `us-east-1` to co-locate with App Runner
3. From **Connection Details**, copy the connection string — use the **Pooled connection** URL for serverless environments

Connection string format:

```
postgresql://user:password@ep-xxx-yyy.us-east-1.aws.neon.tech/dbname?sslmode=require
```

### Set the SSM parameter

```bash
aws ssm put-parameter \
  --name /resumeloop/prod/DATABASE_URL \
  --value "<YOUR_CONNECTION_STRING>" \
  --type SecureString \
  --overwrite
```

### Schema initialization

`NeonAdapter.initialize()` executes `NEON_SCHEMA` (defined in `lib/db-adapter.ts`) on the first call to `getAdapter()`. It uses `CREATE TABLE IF NOT EXISTS` throughout, so it is safe to run against an existing database. The demo user is seeded with `ON CONFLICT (email) DO NOTHING`.

Unlike SQLite, the Neon schema is fully current from the start — the migration guards are not needed and are not applied.

### Differences from SQLite

| Aspect | SQLite | Neon (Postgres) |
|---|---|---|
| Parameter placeholders | `?` | `$1`, `$2`, ... |
| Auto-increment PK | `INTEGER PRIMARY KEY` | `BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY` |
| Timestamps | `DATETIME` | `TIMESTAMPTZ` |
| Upsert on conflict | `INSERT OR REPLACE` | `ON CONFLICT (...) DO UPDATE SET ...` |
| Concurrent reads during writes | WAL mode | Native MVCC |

The `NeonAdapter` translates `?` placeholders to `$N` automatically via `translatePlaceholders()`. SQL that uses `?` in application code runs unchanged on both backends.

### Monitor Neon usage

[Neon dashboard](https://console.neon.tech) → Project → **Metrics** tab shows compute time, storage, and connection counts.

### Backup

Neon provides automatic point-in-time recovery (PITR) on paid plans. For a manual dump, use `pg_dump` with your Neon connection string as the target DSN.

### Branching for staging

Neon supports database branching — create a branch of the production database for use as a staging environment:

1. Neon dashboard → Project → **Branches** → New Branch
2. Copy the branch's connection string
3. Set `DATABASE_URL` to the branch URL in your staging environment

---

## Useful queries

These queries work on both SQLite (via `sqlite3 resume.db`) and Neon (via `psql` or the Neon SQL editor).

```sql
-- Job counts by visa status
SELECT visa_status, COUNT(*) as count
FROM jd_jobs
GROUP BY visa_status;

-- Jobs by role track
SELECT role_track, COUNT(*) as count
FROM jd_jobs
GROUP BY role_track
ORDER BY count DESC;

-- Recent outputs with tagline
SELECT job_id, variant, tagline, built_at
FROM jd_outputs
ORDER BY built_at DESC
LIMIT 10;

-- AI token usage by feature
SELECT
  feature,
  SUM(input_tok)  AS total_input_tokens,
  SUM(output_tok) AS total_output_tokens,
  COUNT(*)        AS call_count
FROM ai_usage_log
GROUP BY feature
ORDER BY total_input_tokens DESC;

-- AI usage by user
SELECT
  user_id,
  SUM(input_tok + output_tok) AS total_tokens
FROM ai_usage_log
GROUP BY user_id;

-- Jobs without any output yet
SELECT j.id, j.company, j.role_title
FROM jd_jobs j
LEFT JOIN jd_outputs o ON o.job_id = j.id
WHERE o.id IS NULL
  AND j.visa_status != 'visa-kill';

-- All chat messages for a session
SELECT role, content, created_at
FROM chat_messages
WHERE session_id = '<SESSION_ID>'
ORDER BY created_at ASC;
```

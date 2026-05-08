---
title: "Architecture Overview"
description: "Data flow, key files, SQLite schema, and the two-path design of ResumeAnalyze."
tags: [architecture, sqlite, data-flow]
updated: 2026-05-08
---

# Architecture Overview

ResumeAnalyze is a Next.js 14 app that caches a folder of Obsidian job-posting markdown files into SQLite, scores them for fit, and exposes a dashboard for tracking application status.

## Data Flow

```
Obsidian vault (.md files)
        │
        │  POST /api/batch/scan
        ▼
   jd-parser.ts          ← parse frontmatter + body
   fit-scorer.ts         ← assign role_track + fit_pct
        │
        │  upsert (skip unchanged by file_mtime)
        ▼
   resume.db  ─── jd_jobs ──────────── source-of-truth for query path
                  jd_outputs           resume build records
                  jd_metrics           pipeline snapshot (written on each /metrics call)
                  app_settings         persistent config (e.g. jobs_path)
        │
        │  GET /api/jobs, /api/metrics
        ▼
   Dashboard (Jobs table, Pipeline Sankey, Fit chart)
        │
        │  PATCH /api/jobs/[id]/action
        ▼
   .md frontmatter (Action: X-Stage)  ← always written first
   resume.db jd_jobs.action           ← updated second
```

## Key Files

| File | Role |
|------|------|
| `lib/db.ts` | Opens SQLite connection (WAL mode), runs `initSchema`, handles migrations for `file_mtime` and `action` columns added after initial release. |
| `lib/jd-parser.ts` | Parses `.md` frontmatter with `gray-matter`. Extracts `company`, `role_title` (via 7-step title heuristic), `tags`, `visa_status`, and `action`. Runs visa-kill pattern matching against body text. |
| `lib/fit-scorer.ts` | Maps job content to a `role_track` string and a `fit_pct` integer (0–100). |
| `lib/actions.ts` | Single source of truth for the 7 valid `ActionStage` values. |
| `lib/get-metrics.ts` | Aggregates pipeline counts, role-track distribution, and fit histogram from SQLite. Writes a snapshot row to `jd_metrics` on each call. |
| `lib/settings.ts` | Reads/writes `app_settings` table. Used by the scan route to resolve `jobs_path`. |
| `app/api/batch/scan/route.ts` | Incremental scan: reads all `.md` files, skips unchanged (by `file_mtime`), upserts changed files in a single transaction. |
| `app/api/jobs/[id]/action/route.ts` | Action write-back: writes `Action` key to `.md` frontmatter first, then updates SQLite. |
| `reset-db.sh` | Deletes `resume.db` so the next Scan re-imports everything from the `.md` folder. |

## SQLite Schema

### `jd_jobs`

Primary table. One row per job posting. `id` is a slug derived from `company + role_title`.

| Column | Type | Notes |
|--------|------|-------|
| `id` | TEXT PK | `company-role-title` slug, ≤80 chars |
| `file_path` | TEXT | Absolute path to the `.md` file |
| `company` | TEXT | Parsed from frontmatter/filename |
| `role_title` | TEXT | Cleaned role title (noise-stripped) |
| `tags` | TEXT | JSON-encoded `string[]` from frontmatter |
| `visa_status` | TEXT | `'proceed'` \| `'kill'` \| `'unknown'` |
| `action` | TEXT | Current pipeline stage (nullable) |
| `role_track` | TEXT | Scored track, e.g. `'genai'`, `'systems'` |
| `fit_pct` | INTEGER | 0–100 fit score |
| `raw_content` | TEXT | Full markdown body (after frontmatter) |
| `file_mtime` | TEXT | ISO timestamp of `.md` file at last scan |
| `scanned_at` | DATETIME | Timestamp of last successful scan |

### `jd_outputs`

One row per resume build. References `jd_jobs.id`.

| Column | Type | Notes |
|--------|------|-------|
| `id` | TEXT PK | Build ID |
| `job_id` | TEXT FK | → `jd_jobs.id` |
| `docx_path` | TEXT | Path to generated `.docx` |
| `projects_used` | TEXT | JSON list of project IDs |
| `work_ids_used` | TEXT | JSON list of work IDs |
| `variant` | TEXT | `'genai'` \| `'systems'` \| `'IT-track'` |
| `tagline` | TEXT | Tagline used in the build |
| `built_at` | DATETIME | Build timestamp |

### `jd_metrics`

Append-only snapshots. Written every time `/api/metrics` is called.

| Column | Type | Notes |
|--------|------|-------|
| `computed_at` | DATETIME | |
| `total_jobs` | INTEGER | |
| `visa_kill_count` | INTEGER | |
| `role_track_dist` | TEXT | JSON `Record<string, number>` |
| `fit_dist` | TEXT | JSON histogram by 10-point buckets |

### `app_settings`

Simple key-value store. Currently used for one key:

| Key | Description |
|-----|-------------|
| `jobs_path` | Absolute path to the Obsidian folder containing job `.md` files |

## Source of Truth: `.md` Files vs. SQLite

SQLite is a **cache**, not the source of truth. The rules:

- **`.md` files are authoritative** for all content: job text, tags, visa language, and `Action` stage.
- **SQLite is the query layer**: enables fast filtering, aggregation, and Sankey metrics without re-parsing every file.
- **Action writes go to `.md` first.** The `PATCH /api/jobs/[id]/action` handler writes `Action` to frontmatter before updating `jd_jobs.action`. If the server crashes after the file write but before the SQL update, the next Scan will re-read the correct value from the file.
- **Resetting the DB loses nothing permanent.** All data can be reconstructed from the `.md` folder via Scan.

## Two-Path Design

**Scan path** (write path):

```
File system → parse → score → upsert → SQLite
```

Triggered manually via the Scan button. Incremental: skips files where `file_mtime` has not changed. Safe to run repeatedly.

**Query path** (read path):

```
SQLite → API routes → React components
```

All dashboard reads go to SQLite only. No file I/O on the read path — keeps the UI fast even with 500+ job files.

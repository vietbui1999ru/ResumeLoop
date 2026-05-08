---
title: "Scanning and Resetting the Database"
description: "How incremental scanning works, when to run it, how to configure the jobs folder, and when to reset the database."
tags: [scan, reset, sqlite, settings]
updated: 2026-05-08
---

# Scanning and Resetting the Database

## How Scanning Works

Scanning is triggered manually from the dashboard (the **Scan** button calls `POST /api/batch/scan`).

The scan is **incremental**: it reads the `jobs_path` folder, checks each `.md` file's `mtime` against the value stored in `jd_jobs.file_mtime`, and skips any file that has not changed. Only modified or new files are parsed, scored, and upserted.

Scan flow for each file:

```
stat(file) → compare mtime → if changed:
  readFile → parseJd (frontmatter + visa) → scoreJd (role_track + fit_pct) → upsert
```

All upserts run inside a single SQLite transaction. The response body reports:

```json
{ "scanned": 12, "unchanged": 546, "skipped": 0 }
```

- `scanned` — files that were new or changed and were processed.
- `unchanged` — files skipped because `mtime` matched the stored value.
- `skipped` — files that threw a parse error (logged but not fatal).

## When to Scan

Run a Scan after any of these events:

- **New jobs clipped** into the Obsidian vault.
- **Tags changed** in Obsidian (e.g. `un-resume` → `resume-ed`). Tags are parsed from frontmatter on scan; SQLite does not see the change until you scan.
- **First run** after setting `jobs_path` or after a DB reset.
- **`Action` edited in Obsidian** directly (rather than through the dashboard dropdown). The file write already happened; scanning syncs it to SQLite.

You do not need to scan after changing `Action` through the dashboard — the action route writes both the file and the DB atomically.

## Configuring the Jobs Folder

The `jobs_path` setting tells the scan route where to find `.md` files. Set it from the **Settings** page in the dashboard. It is stored in the `app_settings` SQLite table:

```sql
SELECT value FROM app_settings WHERE key = 'jobs_path';
```

The path must be an absolute directory path that exists on the server's filesystem. If it is not set or does not exist, the scan returns HTTP 400 with an explanatory error message.

## Resetting the Database

`reset-db.sh` deletes `resume.db` entirely:

```bash
./reset-db.sh
# ✓ Deleted resume.db
#   → Open the app and hit Scan to re-import from the jobs folder.
```

The script respects the `DB_PATH` environment variable if set:

```bash
DB_PATH=/custom/path/resume.db ./reset-db.sh
```

**Action and status changes survive a reset.** All `Action` values are stored in `.md` frontmatter (the source of truth). After reset, running Scan re-reads every file and reconstructs the full database including all action stages.

### When to Reset

| Situation | Action |
|-----------|--------|
| Schema migration issues or corrupt DB | Reset + Scan |
| Accumulated stale rows from renamed/deleted `.md` files | Reset + Scan |
| Testing a fresh import | Reset + Scan |
| Normal operation | Never needed — incremental scan handles everything |

Resetting is safe. The only data held exclusively in SQLite (not reconstructable from `.md` files) is `jd_outputs` (resume build history). If build history matters, back up `resume.db` before resetting, or export the data through the dashboard first.

## Settings Reference

| Key | Description | Default |
|-----|-------------|---------|
| `jobs_path` | Absolute path to folder containing job `.md` files | (none — must be set) |

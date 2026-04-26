# ResumeAnalyze — Full-Stack App Design

**Date:** 2026-04-26  
**Status:** Approved  
**Stack:** Next.js 14 (App Router) · better-sqlite3 · LiteLLM → Ollama · Recharts · Node.js worker threads

---

## 1. What This Builds

Web app wrapping the existing resume generation pipeline. Adds:
- Analytics dashboard (role-track breakdown, fit% distribution, output history)
- Batch job processor with SSE progress
- AI chat (pipeline queries + resume advice) via local LLM
- Config editor for `master_resume_data.json` and `buildv2.js`

Existing `buildv2.js` and `master_resume_data.json` are **unchanged by default** — the pipeline wraps them. Config editor allows UI-driven edits with backup-before-write.

Future: Electron wrapper for desktop app (filesystem shortcuts, no server needed).

---

## 2. Architecture

```
Obsidian Jobs/ (markdown JDs, read-only)
        ↓ file scan
   /api/batch/scan  →  jd-parser.ts  →  SQLite (jd_jobs)
        ↓ UI trigger (batch run)
   /api/batch/run  →  batch-worker.ts (3 concurrent worker threads)
        →  fit-scorer.ts  →  fit% + role-track → SQLite
        →  execFile('node', [script])  →  DOCX  →  ~/Desktop/Resume Templates/
        →  tag JD file: un-resume → resume-ed
        ↓ SSE stream
   /api/batch/status  →  UI progress bar

   /api/chat  →  llm-client.ts  →  LiteLLM (localhost:4000)  →  Ollama
        ↑ context: CLAUDE.md + profile summary + SQLite snapshot + slash cmd SQL results

   /api/config/read|write  →  pipeline/master_resume_data.json | pipeline/buildv2.js
```

**Boundaries:**
- Obsidian vault = read-only except JD tag update (`un-resume` → `resume-ed`)
- SQLite = derived cache. Re-buildable from files at any time via `/api/batch/scan`.
- LiteLLM = user-managed sidecar. App assumes `http://localhost:4000` is up.
- `buildv2.js` + `master_resume_data.json` = source of truth. DB never overrides them.

---

## 3. SQLite Schema

```sql
jd_jobs (
  id TEXT PRIMARY KEY,      -- slug from filename
  file_path TEXT NOT NULL,  -- absolute path in Obsidian vault
  company TEXT,
  role_title TEXT,
  tags TEXT,                -- JSON array e.g. ["un-resume","sre"]
  visa_status TEXT,         -- "proceed" | "kill" | "unknown"
  role_track TEXT,          -- matched track from CLAUDE.md role-track table
  fit_pct INTEGER,          -- 0-100
  raw_content TEXT,
  scanned_at DATETIME
)

jd_outputs (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES jd_jobs(id),
  docx_path TEXT,           -- absolute path on ~/Desktop/Resume Templates/
  projects_used TEXT,       -- JSON array of project IDs
  work_ids_used TEXT,       -- JSON array e.g. ["gitlab","carboncopies","udayton"]
  variant TEXT,             -- "genai" | "systems" | "IT-track"
  tagline TEXT,
  built_at DATETIME
)

jd_metrics (
  computed_at DATETIME,
  total_jobs INTEGER,
  visa_kill_count INTEGER,
  role_track_dist TEXT,     -- JSON {track: count}
  fit_dist TEXT             -- JSON bucket counts {"90-100":12,"80-89":34,...}
)
```

`jd_metrics` recomputed on demand (not live). Triggered by dashboard load or manual refresh.

---

## 4. UI Routes

| Route | Purpose |
|---|---|
| `/` | Dashboard: role-track bar chart, fit% histogram, output history table |
| `/jobs` | Job list: filter by tag/track/fit%, checkbox select, batch run button, SSE progress |
| `/chat` | AI chat: messages + input, slash commands, context mode indicator |
| `/config` | Config editor: edit `master_resume_data.json` + `buildv2.js` with backup |

**Dashboard charts (Recharts):**
- Role-track bar chart: x=track name, y=job count
- Fit% histogram: x=bucket (0-9, 10-19 ... 90-100), y=count
- Output history: table sorted by `built_at DESC`, columns: company · role · track · fit% · DOCX link · date

**Config editor:**
- `<textarea>` per file (minimal — no Monaco dependency)
- "Save" → POST `/api/config/write` → backs up to `pipeline/<file>.bak` → writes new content
- Warn if buildv2.js syntax invalid (`node --check` via `execFile`)

---

## 5. AI Chat

**Context injected per session (system prompt):**
```
[static, cached]
- CLAUDE.md rules summary
- master_resume_data.json profile (candidate info, all project IDs + stacks)

[per session, refreshed once]
- SQLite snapshot: total jobs, visa kill count, track distribution, fit distribution
```

**Slash commands (parsed client-side, SQL run server-side):**
| Command | SQL / action |
|---|---|
| `/jobs [track]` | `SELECT * FROM jd_jobs WHERE role_track LIKE ?` |
| `/stats` | `SELECT * FROM jd_metrics ORDER BY computed_at DESC LIMIT 1` |
| `/resume [job_id]` | `SELECT * FROM jd_outputs WHERE job_id = ?` |
| `/scan` | Trigger `/api/batch/scan` |

Plain queries → model reasons from system context, no DB injection.

**LiteLLM config** (repo root, `litellm_config.yaml` — values gitignored via `.env`):
```yaml
model_list:
  - model_name: local
    litellm_params:
      model: ollama/llama3.1
      api_base: http://localhost:11434
```

App calls `POST http://localhost:4000/chat/completions` (OpenAI-compat). Swap model without touching app code.

---

## 6. Batch Pipeline Integration

**Concurrency:** 3 worker threads max (configurable via env `BATCH_CONCURRENCY=3`).

**Per-job steps:**
1. Read JD markdown → `jd-parser.ts` → structured fields
2. Visa check (regex against CLAUDE.md rules) → set `visa_status`
3. Fit score + role-track → `fit-scorer.ts` (keyword matching against track table)
4. Generate build script (inline, writes to `pipeline/batch-build/`)
5. `execFile('node', [scriptPath])` — no shell, no injection risk
6. Move DOCX to `~/Desktop/Resume Templates/<company>_<role>.docx` (slugify: spaces → `_`, strip special chars)
7. Update `jd_jobs` + insert `jd_outputs`
8. Tag JD file: replace `un-resume` → `resume-ed` in frontmatter

**SSE endpoint:** `GET /api/batch/status` streams `{job_id, status, message}` events.

---

## 7. File Structure

```
ResumeAnalyze/
├── app/
│   ├── page.tsx                  -- dashboard
│   ├── jobs/page.tsx             -- job list + batch trigger
│   ├── chat/page.tsx             -- AI chat
│   ├── config/page.tsx           -- config editor
│   ├── layout.tsx                -- sidebar nav
│   └── api/
│       ├── batch/
│       │   ├── scan/route.ts     -- scan Obsidian Jobs/, upsert jd_jobs
│       │   ├── run/route.ts      -- trigger batch build (SSE)
│       │   └── status/route.ts   -- SSE stream
│       ├── chat/route.ts         -- LiteLLM proxy + context injection
│       ├── config/
│       │   ├── read/route.ts
│       │   └── write/route.ts    -- backup + write
│       └── metrics/route.ts      -- recompute + return jd_metrics
├── lib/
│   ├── db.ts                     -- better-sqlite3 singleton + migrations
│   ├── jd-parser.ts              -- markdown frontmatter + content → jd_jobs row
│   ├── fit-scorer.ts             -- JD text → fit_pct + role_track
│   ├── batch-worker.ts           -- per-job orchestration (worker thread)
│   └── llm-client.ts             -- LiteLLM OpenAI-compat client
├── components/
│   ├── RoleTrackChart.tsx        -- Recharts bar chart
│   ├── FitDistChart.tsx          -- Recharts histogram
│   ├── OutputHistoryTable.tsx
│   ├── JobsTable.tsx
│   ├── ChatMessages.tsx
│   └── Sidebar.tsx
├── pipeline/
│   ├── buildv2.js                -- existing engine (unchanged unless edited via UI)
│   ├── master_resume_data.json   -- canonical data (unchanged unless edited via UI)
│   └── batch-build/              -- temp working dir, gitignored
├── JobData/Jobs/                 -- Obsidian JD files (symlink or configured path)
├── litellm_config.yaml
├── resume.db                     -- SQLite (gitignored)
├── .env.local                    -- OBSIDIAN_JOBS_PATH, OUTPUT_PATH, LITELLM_URL
└── CLAUDE.md
```

**Env vars (`.env.local`):**
```
OBSIDIAN_JOBS_PATH=/path/to/Obsidian/References/Jobs
OUTPUT_PATH=/Users/vietquocbui/Desktop/Resume Templates
LITELLM_URL=http://localhost:4000
BATCH_CONCURRENCY=3
DB_PATH=./resume.db
```

---

## 8. What's NOT in Scope (this iteration)

- Authentication / multi-user
- Cloud deployment
- Cover letter generation
- Electron wrapper (noted for future)
- Real-time Obsidian vault file watcher (manual scan trigger only)

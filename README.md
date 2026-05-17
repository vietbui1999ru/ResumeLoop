# ResumeAnalyze

Personal job hunt dashboard that turns Obsidian job-description clips into tailored, ATS-optimized DOCX resumes — with fit scoring, cover letter generation, and outreach contact tracking.

## What it does

- **Scan** a folder of Markdown JD files → parse company, role, tags, visa requirements
- **Score** each job for fit percentage and role track (GenAI, Systems, IT-track)
- **Generate** a 1-page tailored DOCX resume per job via AI reasoning + `buildv2.js`
- **Track** application pipeline stages (Saved → Applied → Phone Screen → Interview → Offer)
- **Chat** with your resume data to refine bullet points and add new projects
- **Outreach** — import LinkedIn/alumni contact files per job, get AI contact summaries and draft emails + LinkedIn messages
- **Sessions** — maintain multiple resume profile variants (e.g. one for systems roles, one for GenAI)

## Quick Start

### Local (SQLite)

```bash
npm install
cp .env.example .env.local   # set NEXTAUTH_SECRET, ENCRYPTION_KEY
npm run dev                  # http://localhost:3000
```

Click **Try Demo** on the sign-in page to explore with pre-loaded sample data — no account needed.

### Docker

```bash
docker compose up
```

Persists `resume.db` and file outputs as bind-mounts. See [`docs/deploy.md`](docs/deploy.md) for full setup.

## First-time setup

1. **Settings → Job Postings Folder** — point to your Obsidian vault folder containing job `.md` files
2. **Settings → AI Provider** — add an API key (Anthropic recommended; required for Chat)
3. **Jobs → Scan** — imports and scores all `.md` files
4. Check jobs in the table → **Generate N selected**

## Docs

| Page | Contents |
|---|---|
| [`docs/features.md`](docs/features.md) | Every feature in detail |
| [`docs/architecture.md`](docs/architecture.md) | System design, data flow, key files |
| [`docs/database.md`](docs/database.md) | Full schema reference, migrations, useful queries |
| [`docs/ai-providers.md`](docs/ai-providers.md) | Per-provider setup (Anthropic, OpenAI, Gemini, Groq, OpenRouter, Ollama) |
| [`docs/deploy.md`](docs/deploy.md) | Docker, AWS App Runner deployment |

## Tech Stack

- **Next.js 14** App Router + TypeScript
- **Vercel AI SDK** — multi-provider LLM abstraction (Anthropic, OpenAI, Google, Groq, OpenRouter, Ollama)
- **SQLite** (local via `better-sqlite3`) / **Neon Postgres** (cloud) — same `DbAdapter` interface
- **NextAuth v5** — credential auth + session management
- **gray-matter** — YAML frontmatter parsing for JD files
- **docx** — programmatic DOCX generation

## Key Files

| File | Purpose |
|---|---|
| `master_resume_data.json` | Single source of truth for all bullets, projects, work experience, skills |
| `buildv2.js` | DOCX generation engine |
| `lib/generate-pipeline.ts` | End-to-end resume generation (preflight → ai-reason → build → validate → pdf → finalize) |
| `lib/ai-client.ts` | `getModel(userId)` — resolves active provider + model from DB |
| `lib/db-adapter.ts` | `DbAdapter` interface + `SqliteAdapter` + `NeonAdapter` |
| `lib/jd-parser.ts` | Parses JD frontmatter, extracts company/role/tags/visa/clip date |
| `CLAUDE.md` | Candidate profile, hard constraints, role-track table |

## By the numbers

| Metric | Count |
|---|---|
| TypeScript files | 153 |
| Lines of code (TS/TSX) | ~16,000 |
| API routes | 47 |
| React components | 22 |
| Lib modules | 39 |
| Database tables | 14 |
| Test files | 23 |
| Tests | 202 |
| Test assertions | 332 |
| npm dependencies | 51 (34 prod + 17 dev) |
| Job descriptions in corpus | 609 |
| Git commits | 176 |
| Project age | ~3 weeks |

# ResumeLoop

Personal job hunt dashboard that turns Obsidian job-description clips into tailored, ATS-optimized DOCX resumes — with fit scoring, cover letter generation, and outreach contact tracking.

Live at **[resumeloop.me](https://resumeloop.me)** · [Try Demo](https://resumeloop.me/auth/signin)

## What it does

- **Clip** job postings via Obsidian Web Clipper → lands directly in the jobs table
- **Paste** raw JD markdown inline — no file system required
- **Scan** a local folder of JD `.md` files (desktop Chrome/Edge, or any browser in local mode)
- **Score** each job for fit percentage and role track (GenAI, Systems, IT-track)
- **Generate** a 1-page tailored DOCX + PDF resume per job via AI reasoning + `buildv2.js`
- **Preview** resume PDF inline, side-by-side with the job description
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

1. **Settings → Job Postings Folder** — point to your Obsidian vault folder containing job `.md` files (Chrome/Edge desktop only — File System Access API)
2. **Settings → AI Provider** — add an API key (Anthropic recommended; required for Chat)
3. **Jobs → Scan** — imports and scores all `.md` files, or use **Paste Job** to import one inline
4. Check jobs in the table → **Generate N selected**

## Obsidian Web Clipper

Two templates in `docs/` — import into the Obsidian Web Clipper plugin:

| Template | Trigger | Saves to |
|---|---|---|
| [`obsidian-jd-clipper-template.md`](docs/obsidian-jd-clipper-template.md) | LinkedIn Jobs, Greenhouse, Ashby, Workday, and more | `References/Jobs/` |
| [`obsidian-linkedin-outreach-template.md`](docs/obsidian-linkedin-outreach-template.md) | LinkedIn profiles (`/in/`) | `References/Network/` |

See the in-app onboarding guide for full clip-to-resume walkthrough.

## Deployment

Runs on **AWS ECS Fargate** behind an **Application Load Balancer** with zero-downtime rolling deploys.

- Zero-downtime: ALB health-checks gate traffic; new task must pass `/api/health` before old one drains
- Auto-rollback: ECS deployment circuit breaker reverts on failed health check
- HTTPS: ACM certificate on the ALB, HTTP → HTTPS redirect
- Database: Neon Postgres (serverless) in cloud mode; SQLite in local/Docker mode

Push to `main` → GitHub Actions builds, pushes to ECR, deploys to ECS, verifies via API Gateway health check.

## Auth

- **Credentials** — email + password (bcrypt)
- **OAuth** — Google and GitHub (configure via `GOOGLE_CLIENT_ID/SECRET`, `GITHUB_CLIENT_ID/SECRET`)
- **Demo** — one-click, no account; demo users are purged daily via `/api/cron/cleanup-demo`
- Desktop only — mobile browsers are redirected to a "not supported" page

## Docs

| Page | Contents |
|---|---|
| [`docs/features.md`](docs/features.md) | Every feature in detail |
| [`docs/architecture.md`](docs/architecture.md) | System design, data flow, key files |
| [`docs/database.md`](docs/database.md) | Full schema reference, migrations, useful queries |
| [`docs/ai-providers.md`](docs/ai-providers.md) | Per-provider setup (Anthropic, OpenAI, Gemini, Groq, OpenRouter, Ollama) |
| [`docs/deploy.md`](docs/deploy.md) | Docker, AWS ECS Fargate deployment |

## Tech Stack

- **Next.js 14** App Router + TypeScript
- **Vercel AI SDK** — multi-provider LLM abstraction (Anthropic, OpenAI, Google, Groq, OpenRouter, Ollama)
- **SQLite** (local via `better-sqlite3`) / **Neon Postgres** (cloud) — same `DbAdapter` interface
- **NextAuth v5** — credential auth + OAuth (Google, GitHub) + session management
- **LibreOffice headless** — DOCX → PDF conversion
- **gray-matter** — YAML frontmatter parsing for JD files
- **docx** — programmatic DOCX generation
- **AWS ECS Fargate + ALB** — production hosting

## Key Files

| File | Purpose |
|---|---|
| `master_resume_data.json` | Single source of truth for all bullets, projects, work experience, skills |
| `buildv2.js` | DOCX generation engine |
| `lib/generate-pipeline.ts` | End-to-end resume generation (preflight → ai-reason → build → validate → pdf → finalize) |
| `lib/ai-client.ts` | `getModel(userId)` — resolves active provider + model from DB |
| `lib/db-adapter.ts` | `DbAdapter` interface + `SqliteAdapter` + `NeonAdapter` |
| `lib/jd-parser.ts` | Parses JD frontmatter, extracts company/role/tags/visa/clip date |
| `infra/setup-alb.sh` | One-shot ALB provisioning script (run once; wires ECS → ALB → API Gateway) |
| `CLAUDE.md` | Candidate profile, hard constraints, role-track table |

## By the numbers

| Metric | Count |
|---|---|
| TypeScript files | 172 |
| Lines of code (TS/TSX) | ~18,800 |
| API routes | 51 |
| React components | 23 |
| Lib modules | 42 |
| Test files | 31 |
| npm dependencies | 51 (34 prod + 17 dev) |
| Job descriptions in corpus | 609 |
| Git commits | 217 |
| Project age | ~4 weeks |

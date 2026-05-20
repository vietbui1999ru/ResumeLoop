# ResumeLoop

Personal job hunt dashboard that turns job descriptions into tailored, ATS-optimized DOCX resumes — with fit scoring, cover letter generation, outreach contact tracking, and an interactive onboarding tour.

Live at **[resumeloop.me](https://resumeloop.me)** · [Try Demo](https://resumeloop.me/auth/signin)

## What it does

- **Clip** job postings via Obsidian Web Clipper → lands directly in the jobs table
- **Paste** raw JD markdown inline — no file system required
- **Scan** a local folder of JD `.md` files (desktop Chrome/Edge, or any browser in local mode)
- **Score** each job for fit percentage and role track (GenAI, Systems, IT-track)
- **Generate** a 1-page tailored DOCX + PDF resume per job via AI reasoning + `buildv2.js`
- **Preview** resume PDF inline, side-by-side with the job description
- **Track** application pipeline stages (Saved → Applied → Phone Screen → Interview → Offer)
- **Chat** with your resume data — refine bullets live with a side-by-side bullets editor, import GitHub repos as context, and review AI-suggested diffs before applying them
- **Outreach** — import LinkedIn/alumni contact files per job, get AI contact summaries and draft emails + LinkedIn messages
- **Sessions** — maintain multiple resume profile variants (e.g. one for systems roles, one for GenAI)
- **Personal info** — edit name, phone, location, LinkedIn, portfolio, and work authorization from the account page; writes into the active resume profile's `contact` block
- **Onboarding tour** — interactive step-by-step guide covering every major workflow; restartable from any page
- **Feedback** — community bug reports and feature requests via GitHub Discussions (Giscus)

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

An interactive **onboarding tour** launches automatically on first sign-in and guides you through each step. Restart it any time from the Help menu.

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

- **Credentials** — email + bcrypt (cost 10); password strength enforced at signup
- **OAuth** — Google and GitHub (configure via `GOOGLE_CLIENT_ID/SECRET`, `GITHUB_CLIENT_ID/SECRET`)
- **Demo** — per-IP sessions; same IP gets the same demo account back on return; reset button wipes and re-creates; auto-purged every 6 hours via in-process cron (`instrumentation.node.ts`)
- **Rate limiting** — login: 10 attempts/min per IP + 20/hr per email; demo creation: 30/min per IP; demo reset: 3/hr per IP; global API: 300 req/min per IP
- Desktop only — mobile browsers are redirected to a "not supported" page

## Security

| Layer | Mechanism |
|---|---|
| Passwords | bcrypt (cost 10) |
| Demo passwords | AES-256-GCM encryption at rest (`lib/crypto.ts`); key from `ENCRYPTION_KEY` env var |
| Auth rate limiting | Token bucket via Upstash Redis (cloud) / in-process Map fallback (local) |
| Global API rate limit | 300 req/min per IP in `middleware.ts` before any route handler runs |
| Content Security Policy | `default-src 'self'`; `frame-ancestors 'none'`; `object-src 'none'` via `next.config.mjs` |
| Account purge | Deletes all DB rows + S3 objects under `outputs/<userId>/` in a single operation |
| `/api/fs` route | Disabled in cloud mode — returns 403 to prevent server-side filesystem access |
| Session tokens | NextAuth v5 JWT; `AUTH_TRUST_HOST` for proxy environments |
| SQL injection | Parameterized queries throughout; `translatePlaceholders()` converts `?` → `$N` for Postgres |
| User isolation | Every query filters by `user_id`; DB-level index on `(user_id, ...)` for all data tables |

## Architecture

```
Request
  └─ middleware.ts          global rate limit → mobile redirect → auth guard
       └─ Next.js App Router
            ├─ app/(app)/   authenticated pages (jobs, chat, config, account, settings, feedback)
            └─ app/api/     REST routes (53 handlers)

Data layer
  ├─ lib/db-adapter.ts      DbAdapter interface (query / queryOne / run / runInTransaction)
  ├─ lib/db.ts              SqliteAdapter + schema + migrations (local mode)
  └─ lib/db-neon.ts         NeonAdapter — translatePlaceholders(?→$N) + idempotent initialize()

Generation pipeline
  lib/generate-pipeline.ts
    preflight → lib/ai-reason.ts (select bullets) → pipeline/buildv2.js (DOCX)
    → LibreOffice (PDF) → lib/storage.ts (S3 or local) → finalize
```

### Dual-mode database

The same `DbAdapter` interface runs on SQLite locally and Neon Postgres in production. Key details:

- `translatePlaceholders()` rewrites SQLite `?` positional params to Postgres `$1, $2, ...` at query time
- `NeonAdapter.initialize()` is idempotent — all schema changes use `CREATE IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS`
- SQLite migrations use `pragma_table_info` guards (`hasColumn()`) instead
- FTS5 full-text search is SQLite-only; the cloud path uses `ILIKE` (guarded by `isCloud()`)
- `runInTransaction` wraps multiple statements atomically on SQLite; best-effort sequential on Neon HTTP

## Testing

### Unit + Integration (Vitest)

Tests run with **Vitest** in Node environment. No browser or DOM environment configured — all tests are pure TypeScript.

```bash
npm test              # run all tests once
npm test -- --watch   # watch mode
```

**Patterns:**

**DB-level tests** (`lib/*.test.ts`) — spin up an in-memory SQLite DB via `initSchema`, wrap it in `SqliteAdapter`, and test data invariants directly. No mocks. Fast.

```typescript
const db = new Database(':memory:')
initSchema(db)
const adapter = new SqliteAdapter(db)
// ... insert rows, assert queries
```

**API route tests** (`app/api/**/*.test.ts`) — mock `@/lib/auth` and `@/lib/db-adapter` with `vi.mock`, call the exported handler function directly, assert on response status and captured `db.run` call arguments.

```typescript
vi.mock('@/lib/auth',       () => ({ auth: vi.fn() }))
vi.mock('@/lib/db-adapter', () => ({ getAdapter: vi.fn() }))
const res = await POST(makeRequest({ ... }), makeCtx())
expect(res.status).toBe(200)
```

**Coverage areas**: demo user lifecycle, profile CRUD and isolation, fit scoring, AI reasoning pipeline, generate pipeline, rate limiting, schema migrations, API route auth guards (401/403/404), contact patch, demo reset.

### E2E (Playwright)

End-to-end tests run with **Playwright** against a live dev server on an isolated test database. Cross-browser: Chrome, Firefox, and Safari.

```bash
npx playwright test           # run all E2E specs
npx playwright test --ui      # interactive UI mode
```

Auth state is pre-established via `e2e/auth.setup.ts` and reused across specs — no re-login per test.

| Spec | What it covers |
|---|---|
| `smoke.spec.ts` | Landing page, auth routes, health checks |
| `auth.spec.ts` | Login, signup, OAuth flows, rate limiting |
| `journeys/new-user.spec.ts` | Full flow: signup → profile setup → first job generation |
| `journeys/returning-user.spec.ts` | Session persistence, resume generation, pipeline updates |
| `journeys/bullets-editor.spec.ts` | Chat with live bullets panel; edit and save bullets inline |

## Tech Stack

- **Next.js 14** App Router + TypeScript
- **Vercel AI SDK** — multi-provider LLM abstraction (Anthropic, OpenAI, Google, Groq, OpenRouter, Ollama)
- **SQLite** (local via `better-sqlite3`) / **Neon Postgres** (cloud) — same `DbAdapter` interface
- **NextAuth v5** — credentials + OAuth (Google, GitHub) + JWT session management
- **Upstash Redis** — rate limiting in cloud mode (token bucket); in-process Map fallback locally
- **LibreOffice headless** — DOCX → PDF conversion
- **docx** — programmatic DOCX generation
- **gray-matter** — YAML frontmatter parsing for JD files
- **AWS ECS Fargate + ALB** — production hosting; S3 for resume file storage
- **Vitest** — unit + integration tests
- **Playwright** — cross-browser E2E tests (Chrome, Firefox, Safari)

## Key Files

| File | Purpose |
|---|---|
| `pipeline/master_resume_data.json` | Single source of truth for all bullets, projects, work experience, skills |
| `pipeline/buildv2.js` | DOCX generation engine |
| `lib/generate-pipeline.ts` | End-to-end resume generation (preflight → ai-reason → build → validate → pdf → finalize) |
| `lib/ai-reason.ts` | AI bullet selection and fit scoring logic |
| `lib/prompt-context.ts` | Builds LLM prompt context from profile + JD |
| `lib/ai-client.ts` | `getModel(userId)` — resolves active provider + model from DB |
| `lib/db-adapter.ts` | `DbAdapter` interface + `SqliteAdapter` + `NeonAdapter` with `translatePlaceholders()` |
| `lib/db.ts` | SQLite schema init, `hasColumn()` migration guards, FTS5 triggers |
| `lib/crypto.ts` | AES-256-GCM encrypt/decrypt for sensitive fields at rest |
| `lib/rate-limit.ts` | Token bucket rate limiter — Upstash Redis (cloud) or in-process Map (local) |
| `lib/demo-seed.ts` | Per-IP demo user lifecycle: create, reuse, reset, purge |
| `lib/auth.ts` | NextAuth config — credentials + OAuth, rate-limited login, session callbacks |
| `lib/storage.ts` | S3 upload/download/delete for resume files; local disk fallback |
| `contexts/TourContext.tsx` | Interactive onboarding tour — 35+ steps across all pages, tracks seen state |
| `contexts/SessionContext.tsx` | Chat session management — supports multiple independent sessions per user |
| `components/BulletsPreview.tsx` | Live bullets editor panel in Chat (Rendered / Markdown / JSON tabs) |
| `components/GithubIngest.tsx` | GitHub repo sync for Chat context |
| `instrumentation.node.ts` | In-process cron — runs demo cleanup every 6 hours at server startup |
| `middleware.ts` | Global rate limit + mobile redirect + auth guard |
| `infra/setup-alb.sh` | One-shot ALB provisioning script |
| `CLAUDE.md` | Candidate profile, hard constraints, role-track table (agentic context) |

## By the numbers

| Metric | Count |
|---|---|
| TypeScript files | 295 |
| Lines of code (TS/TSX) | ~30,800 |
| API routes | 53 |
| React components | 27 |
| Lib modules | 46 |
| Vitest test files | 52 |
| Playwright E2E spec files | 6 |
| npm dependencies | 53 (35 prod + 18 dev) |
| Git commits | 273 |
| Project age | ~5 weeks |

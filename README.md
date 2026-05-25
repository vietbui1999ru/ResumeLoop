# ResumeLoop

Personal job hunt dashboard that turns job descriptions into tailored, ATS-optimized DOCX resumes — with fit scoring, cover letter generation, outreach contact tracking, and an interactive onboarding tour.

Live at **[resumeloop.me](https://resumeloop.me)** · [Try Demo](https://resumeloop.me/auth/signin)

## What it does

- **Clip** job postings via Obsidian Web Clipper → lands directly in the jobs table
- **Paste** raw JD markdown inline — no file system required
- **Scan** a local folder of JD `.md` files (desktop Chrome/Edge, or any browser in local mode)
- **Upload** `.md` files via drag-and-drop on jobs page; see failed imports in summary
- **Score** each job for fit percentage and role track (GenAI, Systems, IT-track, SRE)
- **Generate** a 1-page tailored DOCX + PDF resume per job via AI reasoning + `buildv2.js`
- **Preview** resume PDF inline, side-by-side with the job description
- **Track** application pipeline stages (Saved → Applied → Phone Screen → Interview → Offer) — stage and action columns stay bidirectionally synced
- **Chat** with your resume data — refine bullets live with a side-by-side bullets editor, import GitHub repos as context, and review AI-suggested diffs before applying them
- **Outreach** — import LinkedIn/alumni contact files per job, get AI contact summaries and draft emails + LinkedIn messages
- **Profile editor** — drag-to-reorder experience, projects, and skills; toggle inclusion/exclusion per entry; preview JSON diffs before saving
- **Sessions** — maintain multiple resume profile variants (e.g. one for systems roles, one for GenAI)
- **Personal info** — edit name, phone, location, LinkedIn, portfolio, and work authorization from the account page; writes into the active resume profile's `contact` block
- **Profile ingestion** — `/onboarding` builds your resume profile from any combination of: a GitHub handle, a LinkedIn/portfolio URL (Firecrawl-powered scrape with raw fetch fallback), or pasted text; extracts structured data, merges sources with most-specific-wins conflict resolution, and flags conflicts for review before saving
- **Onboarding tour** — interactive step-by-step guide covering every major workflow; restartable from any page
- **Theme toggle** — light/dark mode with semantic token system; respects system preference; toggle in Settings → Appearance or sidebar/mobile header
- **Mobile & desktop** — fully responsive design with touch-optimized inputs and layouts
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
3. **Jobs → Scan** or **Upload .md files** — imports and scores all files, or use **Paste Job** to import one inline
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
- **Rate limiting** — login: 10 attempts/min per IP + 20/hr per email; demo creation: 30/min per IP; demo reset: 3/hr per IP; global API: 300 req/min per IP; password reset: 5 attempts/15 min per token
- **Mobile support** — responsive layouts for all screen sizes; touch-optimized inputs and menus

## Security

Comprehensive security audit (May 2026) addressing 4 HIGH, 6 MEDIUM, and multiple LOW findings.

| Layer | Mechanism |
|---|---|
| Passwords | bcrypt (cost 10) |
| Demo credentials | Single-use tokens (30s TTL) via `lib/demo-token-store.ts`; credentials never leave server |
| Auth rate limiting | Token bucket via Upstash Redis (cloud) / in-process Map fallback (local); per-token limits on password reset |
| JWT validation | Fail-closed: invalid/expired sessions return null instead of remaining valid |
| DNS rebinding | `resolvePublicHost()` validates IP; subsequent HTTPS connects to pinned IP (SNI for TLS) — prevents TOCTOU |
| Global API rate limit | 300 req/min per IP in `middleware.ts` before any route handler runs |
| Prompt injection defense | 2000-char budget + HTML/XML/control-char stripping; untrusted data wrapped in XML delimiters |
| Content Security Policy | `default-src 'self'`; `frame-ancestors 'none'`; `object-src 'none'` via `next.config.mjs` |
| Account purge | Deletes all DB rows + S3 objects under `outputs/<userId>/` in a single operation |
| `/api/fs` route | Disabled in cloud mode — returns 403 to prevent server-side filesystem access |
| Session tokens | NextAuth v5 JWT; `AUTH_TRUST_HOST` for proxy environments |
| SQL injection | Parameterized queries throughout; `translatePlaceholders()` converts `?` → `$N` for Postgres |
| User isolation | Every query filters by `user_id`; DB-level index on `(user_id, ...)` for all data tables |
| Metrics endpoint | `/api/metrics/prometheus` requires METRICS_TOKEN in all modes (not cloud-only) |

## Architecture

```
Request
  └─ middleware.ts          global rate limit → auth guard
       └─ Next.js App Router
            ├─ app/(app)/   authenticated pages (jobs, chat, config, account, settings, feedback)
            └─ app/api/     REST routes (75 handlers)

Data layer
  ├─ lib/db-adapter.ts      DbAdapter interface (query / queryOne / run / runInTransaction)
  ├─ lib/db.ts              SqliteAdapter + schema + migrations (local mode)
  └─ lib/db-neon.ts         NeonAdapter — translatePlaceholders(?→$N) + idempotent initialize()

Generation pipeline
  lib/generate-pipeline.ts
    preflight → lib/ai-reason.ts (select bullets) → pipeline/buildv2.js (DOCX)
    → LibreOffice (PDF) → lib/storage.ts (S3 or local) → finalize

Theme system
  lib/theme.ts — applyTheme(), buildThemeInitScript(), system preference detection
  app/globals.css — light mode token overrides (warm neutrals, WCAG AA adapted palette)
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

**Coverage areas**: demo user lifecycle, profile CRUD and isolation, fit scoring, AI reasoning pipeline, generate pipeline, rate limiting, schema migrations, API route auth guards (401/403/404), contact patch, demo reset, security audit fixes.

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

- **Next.js 15** App Router + TypeScript
- **Vercel AI SDK** — multi-provider LLM abstraction (Anthropic, OpenAI, Google, Groq, OpenRouter, Ollama)
- **SQLite** (local via `better-sqlite3`) / **Neon Postgres** (cloud) — same `DbAdapter` interface
- **NextAuth v5** — credentials + OAuth (Google, GitHub) + JWT session management
- **Upstash Redis** — rate limiting in cloud mode (token bucket); in-process Map fallback locally
- **dnd-kit** — drag-and-drop reordering for profile editor
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
| `lib/pipeline-tags.ts` | TAG_TO_ACTION / ACTION_TO_TAG maps for bidirectional stage-action sync |
| `lib/theme.ts` | `applyTheme()`, `buildThemeInitScript()`, system preference detection |
| `lib/config.ts` | Central config constants (char limits, demo TTL, UI timing, auth rates) |
| `lib/provider-config.ts` | Provider type definitions and labels (client-safe, no server-only imports) |
| `lib/demo-token-store.ts` | Single-use 30s token store for secure demo credential exchange |
| `lib/db-adapter.ts` | `DbAdapter` interface + `SqliteAdapter` + `NeonAdapter` with `translatePlaceholders()` |
| `lib/db.ts` | SQLite schema init, `hasColumn()` migration guards, FTS5 triggers |
| `lib/crypto.ts` | AES-256-GCM encrypt/decrypt for sensitive fields at rest |
| `lib/rate-limit.ts` | Token bucket rate limiter — Upstash Redis (cloud) or in-process Map (local) |
| `lib/demo-seed.ts` | Per-IP demo user lifecycle: create, reuse, reset, purge |
| `lib/auth.ts` | NextAuth config — credentials + OAuth, rate-limited login, session callbacks |
| `lib/storage.ts` | S3 upload/download/delete for resume files; local disk fallback |
| `lib/sanitize-persona.ts` | Defense-in-depth prompt injection protection: char budget, tag stripping, XML wrapping |
| `contexts/TourContext.tsx` | Interactive onboarding tour — 35+ steps across all pages, tracks seen state |
| `contexts/SessionContext.tsx` | Chat session management — supports multiple independent sessions per user |
| `components/BulletsPreview.tsx` | Live bullets editor panel in Chat (Rendered / Markdown / JSON tabs) |
| `components/DropZone.tsx` | Drag-and-drop zone for uploading `.md` files; shows progress and failed filenames |
| `components/ThemeToggle.tsx` | Sun/Moon button; restores persisted theme after hydration; configurable size/className |
| `components/ThemeSync.tsx` | Renders blocking init script to prevent theme FOUC on page load |
| `components/GithubIngest.tsx` | GitHub repo sync for Chat context |
| `components/MobileHeader.tsx` | Mobile-optimized header with menu drawer and theme toggle |
| `components/MobileDrawer.tsx` | Touch-optimized navigation drawer for mobile |
| `components/profile/ExperienceCard.tsx` | Draggable card for work experience with include/exclude toggle |
| `components/profile/ProjectCard.tsx` | Draggable card for projects with include/exclude toggle |
| `components/profile/SkillsRow.tsx` | Skill category row with include/exclude toggle |
| `components/profile/JsonDiffPreview.tsx` | Preview JSON diffs before saving profile changes |
| `components/onboarding/SmartInput.tsx` | Auto-detects input type (GitHub handle / URL / paste) and routes to the correct ingest endpoint |
| `components/onboarding/SourceBoard.tsx` | Multi-source ingestion board — add, preview, and merge sources before saving profile |
| `components/onboarding/ProfileReview.tsx` | Editable profile review step — shows extracted fields and inline conflict warnings |
| `lib/ingest/extract-url.ts` | Firecrawl scrape + raw fetch fallback; DNS rebinding defense + XML wrapping |
| `lib/ingest/extract-github.ts` | GitHub public API → repos + README → LLM-extracted sparse profile |
| `lib/ingest/extract-paste.ts` | Raw text → LLM-extracted sparse profile |
| `lib/ingest/merge.ts` | Most-specific-wins merge strategy + conflict detection across multiple sources |
| `instrumentation.node.ts` | In-process cron — runs demo cleanup every 6 hours at server startup |
| `middleware.ts` | Global rate limit + auth guard |
| `infra/setup-alb.sh` | One-shot ALB provisioning script |
| `infra/otel-collector.yml` | OTel Collector config — receives traces from app, forwards to Tempo with bearer auth |
| `infra/tempo.yml` | Tempo trace storage config with metrics generator for span-to-metric derivation |
| `infra/prometheus/prometheus.yml` | Prometheus scrape config for app + infra metrics |
| `CLAUDE.md` | Candidate profile, hard constraints, role-track table (agentic context) |

## By the numbers

| Metric | Count |
|---|---|
| TypeScript files | 1,446 |
| Lines of code (TS/TSX) | ~154,000 |
| API routes | 75 |
| Lib modules | 60 |
| Vitest test files | 303 |
| Playwright E2E spec files | 5 |
| npm dependencies | 54 (36 prod + 18 dev) |
| Git commits | 334 |
| Project age | ~12 weeks |

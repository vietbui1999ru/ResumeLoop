# ResumeAnalyze Full-Stack App — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wrap the existing resume generation pipeline in a Next.js 14 web app with an analytics dashboard, batch processor with SSE progress, AI chat via LiteLLM/Ollama, and a config editor for `master_resume_data.json` and `buildv2.js`.

**Architecture:** Next.js 14 App Router with API routes for all backend logic. SQLite (better-sqlite3) stores derived JD metadata and output history — re-buildable from source files at any time. Generated build scripts call `buildv2.js`'s `makeDoc()` directly (bypassing its hardcoded `OUT` path) so `buildv2.js` is never modified unless the user edits it via the config UI.

**Tech Stack:** Next.js 14, TypeScript, Tailwind CSS, better-sqlite3, gray-matter, Recharts, p-limit, Vitest

---

## File Map

| File | Responsibility |
|---|---|
| `lib/db.ts` | better-sqlite3 singleton, schema migrations |
| `lib/jd-parser.ts` | markdown frontmatter + content → `JdJob` row |
| `lib/fit-scorer.ts` | JD text → `fit_pct` + `role_track` via keyword matching |
| `lib/run-script.ts` | Promise wrapper around `child_process.spawn` — runs Node scripts safely |
| `lib/batch-worker.ts` | Per-job orchestration: score → generate script → run → move DOCX → tag file |
| `lib/llm-client.ts` | LiteLLM OpenAI-compat streaming client |
| `lib/context-builder.ts` | Builds system prompt for chat from CLAUDE.md + JSON profile + SQLite snapshot |
| `app/api/batch/scan/route.ts` | Scan Obsidian Jobs dir, upsert `jd_jobs` |
| `app/api/batch/run/route.ts` | Start batch (SSE stream), uses `batch-worker.ts` with p-limit(3) |
| `app/api/jobs/route.ts` | List `jd_jobs` for Jobs page |
| `app/api/chat/route.ts` | LiteLLM proxy + context injection + slash cmd SQL |
| `app/api/metrics/route.ts` | Recompute `jd_metrics` from `jd_jobs` + `jd_outputs`, return |
| `app/api/config/read/route.ts` | Read `pipeline/buildv2.js` or `pipeline/master_resume_data.json` |
| `app/api/config/write/route.ts` | Validate + backup + write config files |
| `app/layout.tsx` | Root layout with sidebar nav |
| `components/Sidebar.tsx` | Nav links: Dashboard, Jobs, Chat, Config |
| `app/page.tsx` | Dashboard: two charts + output history table |
| `components/RoleTrackChart.tsx` | Recharts BarChart of role-track distribution |
| `components/FitDistChart.tsx` | Recharts BarChart histogram of fit% buckets |
| `components/OutputHistoryTable.tsx` | Table of `jd_outputs` sorted by `built_at DESC` |
| `app/jobs/page.tsx` | Job list with filter, checkbox select, batch trigger, SSE progress |
| `app/chat/page.tsx` | Chat UI: message list + input + slash commands |
| `app/config/page.tsx` | Two textarea editors for `buildv2.js` + `master_resume_data.json` |
| `pipeline/` | `buildv2.js` + `master_resume_data.json` (moved from root) |
| `pipeline/batch-build/` | Working dir for build scripts (gitignored) |

---

## Task 1: Project Scaffold

**Files:**
- Create: `package.json`, `next.config.ts`, `tsconfig.json`, `.env.local`, `.gitignore`

- [ ] **Step 1: Initialize Next.js 14 app in current directory**

```bash
cd /Users/vietquocbui/repos/ResumeAnalyze
npx create-next-app@14 . --typescript --tailwind --app --no-src-dir --import-alias "@/*" --yes
```

Expected: Next.js project scaffolded. Existing non-conflicting files kept.

- [ ] **Step 2: Install runtime dependencies**

```bash
npm install better-sqlite3 gray-matter recharts p-limit openai
```

- [ ] **Step 3: Install dev dependencies**

```bash
npm install -D @types/better-sqlite3 vitest @vitejs/plugin-react vite-tsconfig-paths
```

- [ ] **Step 4: Configure Next.js to externalise native modules**

Edit `next.config.ts`:

```typescript
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  serverExternalPackages: ['better-sqlite3'],
}

export default nextConfig
```

- [ ] **Step 5: Configure Vitest**

Create `vitest.config.ts`:

```typescript
import { defineConfig } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: 'node',
    include: ['**/*.test.ts'],
  },
})
```

- [ ] **Step 6: Create `.env.local`**

```
OBSIDIAN_JOBS_PATH=/Users/vietquocbui/repos/Obsidian/References/Jobs
OUTPUT_PATH=/Users/vietquocbui/Desktop/Resume Templates
LITELLM_URL=http://localhost:4000
BATCH_CONCURRENCY=3
DB_PATH=./resume.db
```

- [ ] **Step 7: Update `.gitignore`**

Add to `.gitignore`:

```
.env.local
resume.db
pipeline/batch-build/
```

- [ ] **Step 8: Move existing pipeline files**

```bash
mkdir -p pipeline/batch-build
cp "0. master_resume_data.json" pipeline/master_resume_data.json
cp /Users/vietquocbui/repos/Obsidian/References/Jobs/buildv2.js pipeline/buildv2.js
```

- [ ] **Step 9: Set up batch-build package.json for docx dependency**

Create `pipeline/batch-build/package.json`:

```json
{
  "name": "batch-build",
  "version": "1.0.0",
  "dependencies": {
    "docx": "^8.5.0"
  }
}
```

Then:

```bash
cd pipeline/batch-build && npm install && cd ../..
```

- [ ] **Step 10: Verify dev server starts**

```bash
npm run dev
```

Expected: `▲ Next.js 14.x` starts on `http://localhost:3000`. Ctrl+C after confirming.

- [ ] **Step 11: Commit**

```bash
git init
git add -A
git commit -m "feat: scaffold Next.js 14 app with pipeline files"
```

---

## Task 2: SQLite DB Layer

**Files:**
- Create: `lib/db.ts`
- Create: `lib/db.test.ts`

- [ ] **Step 1: Write failing test**

Create `lib/db.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'

describe('db schema', () => {
  it('creates jd_jobs with required columns', () => {
    const db = new Database(':memory:')
    db.exec(`
      CREATE TABLE IF NOT EXISTS jd_jobs (
        id TEXT PRIMARY KEY,
        file_path TEXT NOT NULL,
        company TEXT,
        role_title TEXT,
        tags TEXT,
        visa_status TEXT,
        role_track TEXT,
        fit_pct INTEGER,
        raw_content TEXT,
        scanned_at DATETIME
      )
    `)
    const cols = db.prepare('PRAGMA table_info(jd_jobs)').all() as Array<{ name: string }>
    const names = cols.map(c => c.name)
    expect(names).toContain('id')
    expect(names).toContain('fit_pct')
    expect(names).toContain('role_track')
    db.close()
  })
})
```

- [ ] **Step 2: Run test**

```bash
npx vitest run lib/db.test.ts
```

Expected: PASS.

- [ ] **Step 3: Implement `lib/db.ts`**

```typescript
import Database, { type Database as DB } from 'better-sqlite3'
import path from 'path'

let _db: DB | null = null

export function getDb(): DB {
  if (_db) return _db
  const dbPath = process.env.DB_PATH
    ? path.resolve(process.cwd(), process.env.DB_PATH)
    : path.join(process.cwd(), 'resume.db')
  _db = new Database(dbPath)
  _db.pragma('journal_mode = WAL')
  _db.pragma('foreign_keys = ON')
  initSchema(_db)
  return _db
}

function initSchema(db: DB): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS jd_jobs (
      id          TEXT PRIMARY KEY,
      file_path   TEXT NOT NULL,
      company     TEXT,
      role_title  TEXT,
      tags        TEXT,
      visa_status TEXT,
      role_track  TEXT,
      fit_pct     INTEGER,
      raw_content TEXT,
      scanned_at  DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS jd_outputs (
      id            TEXT PRIMARY KEY,
      job_id        TEXT NOT NULL REFERENCES jd_jobs(id),
      docx_path     TEXT,
      projects_used TEXT,
      work_ids_used TEXT,
      variant       TEXT,
      tagline       TEXT,
      built_at      DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS jd_metrics (
      computed_at      DATETIME,
      total_jobs       INTEGER,
      visa_kill_count  INTEGER,
      role_track_dist  TEXT,
      fit_dist         TEXT
    );
  `)
}
```

- [ ] **Step 4: Commit**

```bash
git add lib/db.ts lib/db.test.ts
git commit -m "feat: add SQLite db layer with WAL mode and schema migrations"
```

---

## Task 3: JD Parser

**Files:**
- Create: `lib/jd-parser.ts`
- Create: `lib/jd-parser.test.ts`

JD frontmatter has: `title` (e.g. `"(1) IT Intern | Alta Equipment Group"`), `tags` (array). Content has `# Summary` and `# Raw content` sections.

- [ ] **Step 1: Write failing test**

Create `lib/jd-parser.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { parseJd } from './jd-parser'

const SAMPLE = `---
title: "(1) IT Intern | Alta Equipment Group"
tags:
  - "clippings"
  - "jobs"
  - "un-resume"
---
# Raw content
Looking for a candidate with Linux skills. Must be authorized to work in the US.
`

describe('parseJd', () => {
  it('extracts company and role from frontmatter title', () => {
    const r = parseJd('/fake/(1) IT Intern  Alta Equipment Group.md', SAMPLE)
    expect(r.company).toBe('Alta Equipment Group')
    expect(r.role_title).toBe('IT Intern')
  })

  it('stores tags as JSON array string', () => {
    const r = parseJd('/fake/test.md', SAMPLE)
    expect(JSON.parse(r.tags)).toContain('un-resume')
  })

  it('sets visa_status to proceed for "authorized to work in the US"', () => {
    const r = parseJd('/fake/test.md', SAMPLE)
    expect(r.visa_status).toBe('proceed')
  })

  it('sets visa_status to kill for US Citizen requirement', () => {
    const kill = SAMPLE.replace('authorized to work in the US', 'US Citizen or Green Card only required')
    const r = parseJd('/fake/test.md', kill)
    expect(r.visa_status).toBe('kill')
  })

  it('generates id as lowercase slug', () => {
    const r = parseJd('/fake/(1) IT Intern  Alta Equipment Group.md', SAMPLE)
    expect(r.id).toMatch(/^[a-z0-9-]+$/)
  })
})
```

- [ ] **Step 2: Run test to verify fail**

```bash
npx vitest run lib/jd-parser.test.ts
```

Expected: FAIL — `parseJd` not found.

- [ ] **Step 3: Implement `lib/jd-parser.ts`**

```typescript
import matter from 'gray-matter'
import path from 'path'

export interface JdJob {
  id: string
  file_path: string
  company: string
  role_title: string
  tags: string        // JSON-encoded string[]
  visa_status: string // 'proceed' | 'kill' | 'unknown'
  raw_content: string
}

const VISA_KILL_PATTERNS = [
  /us\s+citizen\s*(or|\/)\s*(green\s+card|gc)/i,
  /green\s+card\s*(or|\/)\s*us\s+citizen/i,
  /no\s+sponsorship/i,
  /must\s+be\s+(a\s+)?(us|u\.s\.)\s+citizen/i,
  /us\s+person/i,
  /export\s+control/i,
]

const VISA_PROCEED_PATTERNS = [
  /authorized\s+to\s+work\s+in\s+the\s+us/i,
  /work\s+authorization\s+required/i,
  /equal\s+opportunity\s+employer/i,
]

function detectVisa(text: string): string {
  if (VISA_KILL_PATTERNS.some(re => re.test(text))) return 'kill'
  if (VISA_PROCEED_PATTERNS.some(re => re.test(text))) return 'proceed'
  return 'unknown'
}

function toSlug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9\s-]/g, '').trim()
    .replace(/\s+/g, '-').replace(/-+/g, '-').slice(0, 80)
}

function parseTitle(fmTitle: string, filename: string): { company: string; role_title: string } {
  // Frontmatter title: "(1) IT Intern | Alta Equipment Group"
  const m = fmTitle.match(/^\(\d+\)\s+(.+?)\s*\|\s*(.+)$/)
  if (m) return { role_title: m[1].trim(), company: m[2].trim() }
  // Fallback: filename "(1) Role  Company.md"
  const base = filename.replace(/\.md$/, '')
  const parts = base.split(/\s{2,}/)
  const company = parts[parts.length - 1] ?? 'Unknown'
  const role_title = (parts[0] ?? base).replace(/^\(\d+\)\s+/, '').trim()
  return { company, role_title }
}

export function parseJd(filePath: string, content: string): JdJob {
  const { data: fm, content: body } = matter(content)
  const filename = path.basename(filePath)
  const { company, role_title } = parseTitle(String(fm.title ?? ''), filename)
  const tags: string[] = Array.isArray(fm.tags) ? fm.tags : []
  const id = toSlug(`${company} ${role_title}`.slice(0, 60)) || toSlug(filename)

  return {
    id,
    file_path: filePath,
    company,
    role_title,
    tags: JSON.stringify(tags),
    visa_status: detectVisa(body),
    raw_content: body,
  }
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run lib/jd-parser.test.ts
```

Expected: 5/5 PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/jd-parser.ts lib/jd-parser.test.ts
git commit -m "feat: add JD parser with frontmatter extraction and visa detection"
```

---

## Task 4: Fit Scorer

**Files:**
- Create: `lib/fit-scorer.ts`
- Create: `lib/fit-scorer.test.ts`

- [ ] **Step 1: Write failing test**

Create `lib/fit-scorer.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { scoreJd } from './fit-scorer'

describe('scoreJd', () => {
  it('identifies SRE/DevOps from relevant keywords', () => {
    const jd = 'DevOps engineer: Kubernetes, Prometheus, Grafana, Terraform, Docker, CI/CD, SRE'
    const r = scoreJd(jd)
    expect(r.role_track).toBe('SRE/DevOps')
    expect(r.fit_pct).toBeGreaterThan(30)
  })

  it('identifies AI/LLM from relevant keywords', () => {
    const jd = 'AI engineer: LLM, LangChain, vector database, RAG pipelines, prompt engineering, OpenAI'
    const r = scoreJd(jd)
    expect(r.role_track).toBe('AI/LLM/Agents')
    expect(r.fit_pct).toBeGreaterThan(30)
  })

  it('returns low fit for unrecognized JD', () => {
    const r = scoreJd('We sell widgets. No tech required.')
    expect(r.fit_pct).toBeLessThan(20)
  })
})
```

- [ ] **Step 2: Run to verify fail**

```bash
npx vitest run lib/fit-scorer.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement `lib/fit-scorer.ts`**

```typescript
export interface FitScore {
  role_track: string
  fit_pct: number
}

const TRACK_KEYWORDS: Record<string, string[]> = {
  'AI/LLM/Agents':     ['llm', 'agent', 'langchain', 'openai', 'claude', 'prompt', 'rag', 'vector', 'embedding', 'fine-tuning', 'ai engineer', 'gpt', 'mcp', 'retrieval'],
  'SRE/DevOps':        ['kubernetes', 'k8s', 'prometheus', 'grafana', 'terraform', 'ansible', 'ci/cd', 'sre', 'devops', 'observability', 'alertmanager', 'pagerduty', 'docker'],
  'Backend/API':       ['rest api', 'graphql', 'fastapi', 'flask', 'express', 'microservices', 'grpc', 'api design', 'backend', 'golang', 'go lang'],
  'Software Engineer': ['software engineer', 'full stack', 'full-stack', 'web application', 'react', 'next.js', 'typescript', 'node.js'],
  'Data Engineer':     ['data pipeline', 'etl', 'bigquery', 'spark', 'dbt', 'airflow', 'data warehouse', 'snowflake', 'kafka'],
  'Data Analyst':      ['sql', 'tableau', 'power bi', 'analytics', 'data analysis', 'dashboard', 'metrics', 'kpi', 'looker', 'business intelligence'],
  'ML Engineer':       ['machine learning', 'pytorch', 'tensorflow', 'model training', 'neural network', 'cuda', 'mlops', 'model deployment', 'inference'],
  'Embedded/Systems':  ['embedded', 'rtos', 'firmware', 'uart', 'spi', 'i2c', 'arm', 'cortex', 'fpga', 'bare metal', 'devicetree', 'ble'],
  'Network Engineer':  ['networking', 'bgp', 'ospf', 'vlan', 'cisco', 'tcp/ip', 'routing', 'switching', 'firewall', 'ieee 802'],
  'Security':          ['security', 'penetration testing', 'soc', 'siem', 'vulnerability', 'compliance', 'owasp', 'zero trust', 'iam', 'cryptography'],
  'QA/Testing':        ['qa', 'quality assurance', 'test automation', 'selenium', 'pytest', 'jest', 'cypress', 'load testing', 'regression'],
  'IT/Helpdesk':       ['help desk', 'helpdesk', 'it support', 'desktop support', 'active directory', 'ticketing', 'hardware', 'troubleshoot'],
  'Cloud':             ['aws', 'azure', 'gcp', 'cloud architect', 'lambda', 'ec2', 's3', 'serverless', 'iac'],
  'Rust/Systems':      ['rust', 'tokio', 'systems programming', 'memory safety', 'ownership', 'borrow checker', 'low-level'],
  '.NET/C#':           ['c#', '.net', 'asp.net', 'blazor', 'entity framework', 'wpf', 'dotnet'],
}

const DENOMINATOR = 8 // 8 keyword matches → 100% fit

export function scoreJd(jdText: string): FitScore {
  const lower = jdText.toLowerCase()
  let bestTrack = 'Software Engineer'
  let bestCount = 0

  for (const [track, keywords] of Object.entries(TRACK_KEYWORDS)) {
    const count = keywords.filter(kw => lower.includes(kw)).length
    if (count > bestCount) { bestCount = count; bestTrack = track }
  }

  return {
    role_track: bestTrack,
    fit_pct: Math.min(100, Math.round((bestCount / DENOMINATOR) * 100)),
  }
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run lib/fit-scorer.test.ts
```

Expected: 3/3 PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/fit-scorer.ts lib/fit-scorer.test.ts
git commit -m "feat: add keyword-based fit scorer with role-track detection"
```

---

## Task 5: Script Runner Utility

**Files:**
- Create: `lib/run-script.ts`

Wraps `child_process.spawn` in a promise. Used by batch-worker and config-write.

- [ ] **Step 1: Implement `lib/run-script.ts`**

```typescript
import { spawn } from 'child_process'

export interface RunResult {
  stdout: string
  stderr: string
  code: number
}

export function runNodeScript(scriptPath: string, cwd: string): Promise<RunResult> {
  return new Promise(resolve => {
    const stdout: string[] = []
    const stderr: string[] = []
    const proc = spawn('node', [scriptPath], { cwd })
    proc.stdout.on('data', (d: Buffer) => stdout.push(d.toString()))
    proc.stderr.on('data', (d: Buffer) => stderr.push(d.toString()))
    proc.on('close', code => {
      resolve({ stdout: stdout.join(''), stderr: stderr.join(''), code: code ?? 1 })
    })
  })
}

export function checkNodeSyntax(filePath: string): Promise<RunResult> {
  return new Promise(resolve => {
    const stderr: string[] = []
    const proc = spawn('node', ['--check', filePath])
    proc.stderr.on('data', (d: Buffer) => stderr.push(d.toString()))
    proc.on('close', code => {
      resolve({ stdout: '', stderr: stderr.join(''), code: code ?? 1 })
    })
  })
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/run-script.ts
git commit -m "feat: add run-script utility wrapping child_process.spawn"
```

---

## Task 6: Batch Worker

**Files:**
- Create: `lib/batch-worker.ts`

Selects bullets from `master_resume_data.json`, generates a Node.js build script that calls `buildv2.js`'s `makeDoc()` + `Packer.toBuffer()` directly (bypasses buildv2's hardcoded output path), runs it, writes DOCX to `OUTPUT_PATH`.

- [ ] **Step 1: Implement `lib/batch-worker.ts`**

```typescript
import fs from 'fs'
import path from 'path'
import os from 'os'
import { runNodeScript } from './run-script'
import type { JdJob } from './jd-parser'

const PIPELINE_DIR = path.join(process.cwd(), 'pipeline')
const BATCH_BUILD_DIR = path.join(PIPELINE_DIR, 'batch-build')
const MASTER_JSON = path.join(PIPELINE_DIR, 'master_resume_data.json')

interface WorkEntry { id: string; bullets: string[] }
interface ProjectEntry { id: string; bullets: string[] }

export interface BuildParams {
  tagline: string
  work: WorkEntry[]
  projects: ProjectEntry[]
  skills: string[]
}

export interface WorkerResult {
  job_id: string
  docx_path: string
  build_params: BuildParams
  variant: 'genai' | 'systems' | 'IT-track'
}

type Master = {
  experience: Array<{ id: string; bullets: Record<string, string[]> }>
  projects: Array<{ id: string; bullets: string[] }>
  skills: Record<string, string[]>
  role_track_picks: Record<string, string[]>
}

function slugify(s: string): string {
  return s.replace(/[^a-zA-Z0-9]/g, '_').replace(/_+/g, '_').slice(0, 60)
}

function pickVariant(roleTrack: string): 'genai' | 'systems' | 'IT-track' {
  const systems = ['SRE/DevOps', 'Backend/API', 'Network Engineer', 'Embedded/Systems', 'Rust/Systems', 'Cloud', 'QA/Testing']
  const it = ['IT/Helpdesk']
  if (it.includes(roleTrack)) return 'IT-track'
  if (systems.includes(roleTrack)) return 'systems'
  return 'genai'
}

function pickWorkIds(variant: 'genai' | 'systems' | 'IT-track'): string[] {
  if (variant === 'IT-track') return ['gitlab', 'udayton', 'augustana']
  return ['gitlab', 'carboncopies', 'udayton']
}

function getWorkBullets(master: Master, workId: string, variant: string): string[] {
  const entry = master.experience.find(e => e.id === workId)
  if (!entry) throw new Error(`Work ID not in master: ${workId}`)
  const bullets = entry.bullets[variant] ?? entry.bullets['genai'] ?? entry.bullets['systems']
  if (!bullets) throw new Error(`No bullets for ${workId}/${variant}`)
  return bullets.slice(0, 5)
}

function pickProjectIds(roleTrack: string, master: Master): string[] {
  const trackMap: Record<string, string> = {
    'AI/LLM/Agents': 'AI/LLM/Agents',
    'SRE/DevOps': 'SRE/DevOps Engineer',
    'Backend/API': 'Backend/API Engineer',
    'Software Engineer': 'Software Engineer / Full-Stack',
    'Data Engineer': 'Data Engineer',
    'Data Analyst': 'Data Analyst',
    'ML Engineer': 'ML Engineer',
    'Embedded/Systems': 'Embedded Systems Engineer',
    'Network Engineer': 'Network Engineer',
    'Security': 'Information Security Analyst',
    'QA/Testing': 'QA Analyst / SQA Engineer',
    'IT/Helpdesk': 'IT Support / Helpdesk',
    'Cloud': 'Cloud Engineer',
    'Rust/Systems': 'Rust/Systems Programmer',
    '.NET/C#': '.NET/C# Engineer',
  }
  const key = trackMap[roleTrack] ?? 'Software Engineer / Full-Stack'
  return (master.role_track_picks[key] ?? master.role_track_picks['Software Engineer / Full-Stack'] ?? []).slice(0, 3)
}

function getProjectBullets(master: Master, projectId: string): string[] {
  const proj = master.projects.find(p => p.id === projectId)
  if (!proj) throw new Error(`Project ID not found: ${projectId}`)
  return proj.bullets.slice(0, 3)
}

function inferTagline(job: JdJob, variant: string): string {
  const title = job.role_title.slice(0, 40)
  const tech = variant === 'systems' ? 'Go and Python'
    : variant === 'IT-track' ? 'Linux and networking'
    : 'Python and TypeScript'
  const candidate = `${title} building distributed systems with ${tech}`
  return candidate.length <= 76 ? candidate : `${title} — distributed systems, ${tech}`.slice(0, 76)
}

export async function buildJob(job: JdJob & { role_track?: string }): Promise<WorkerResult> {
  const master: Master = JSON.parse(fs.readFileSync(MASTER_JSON, 'utf8'))
  const variant = pickVariant(job.role_track ?? 'Software Engineer')
  const workIds = pickWorkIds(variant)
  const projectIds = pickProjectIds(job.role_track ?? 'Software Engineer', master)
  const skillsKey = variant === 'genai' ? 'genai' : variant === 'systems' ? 'sre_devops' : 'fullstack'
  const skills: string[] = master.skills[skillsKey] ?? []

  const work: WorkEntry[] = workIds.map(id => ({
    id,
    bullets: getWorkBullets(master, id, variant),
  }))

  const projects: ProjectEntry[] = projectIds.map(id => ({
    id,
    bullets: getProjectBullets(master, id),
  }))

  const tagline = inferTagline(job, variant)
  const params: BuildParams = { tagline, work, projects, skills }

  const outputDir = process.env.OUTPUT_PATH ?? path.join(os.homedir(), 'Desktop', 'Resume Templates')
  const fileSlug = slugify(`${job.company}_${job.role_title}`)
  const docxFilename = `${fileSlug}.docx`
  const docxPath = path.join(outputDir, docxFilename)

  // Sync pipeline files to batch-build
  fs.mkdirSync(BATCH_BUILD_DIR, { recursive: true })
  fs.copyFileSync(path.join(PIPELINE_DIR, 'buildv2.js'), path.join(BATCH_BUILD_DIR, 'buildv2.js'))
  fs.copyFileSync(MASTER_JSON, path.join(BATCH_BUILD_DIR, 'master_resume_data.json'))

  // Generate build script that calls makeDoc() directly (bypasses buildv2's hardcoded OUT path)
  const scriptName = `${fileSlug}.js`
  const script = `
const { makeDoc } = require('./buildv2')
const { Packer } = require('docx')
const fs = require('fs'), path = require('path')

const OUT = ${JSON.stringify(outputDir)}
const data = ${JSON.stringify(params, null, 2)}

async function run() {
  const doc = makeDoc(data)
  const buf = await Packer.toBuffer(doc)
  fs.mkdirSync(OUT, { recursive: true })
  fs.writeFileSync(path.join(OUT, ${JSON.stringify(docxFilename)}), buf)
  console.log('\\u2713 ' + path.join(OUT, ${JSON.stringify(docxFilename)}))
}
run().catch(e => { console.error(e.message); process.exit(1) })
`

  fs.writeFileSync(path.join(BATCH_BUILD_DIR, scriptName), script)

  const result = await runNodeScript(scriptName, BATCH_BUILD_DIR)
  if (result.code !== 0) {
    throw new Error(`Build failed: ${result.stderr || result.stdout}`)
  }

  return { job_id: job.id, docx_path: docxPath, build_params: params, variant }
}
```

- [ ] **Step 2: Smoke-test buildv2 require**

```bash
cd pipeline/batch-build && node -e "const b = require('./buildv2'); console.log(Object.keys(b))" && cd ../..
```

Expected: `[ 'makeDoc', 'build', 'buildMany', 'OUT', 'T', 'TL', 'WORK_META', 'getProjectLookup' ]`

- [ ] **Step 3: Commit**

```bash
git add lib/run-script.ts lib/batch-worker.ts
git commit -m "feat: add batch worker — generates and runs DOCX build scripts via spawn"
```

---

## Task 7: Batch Scan + Run APIs

**Files:**
- Create: `app/api/batch/scan/route.ts`
- Create: `app/api/batch/run/route.ts`
- Create: `app/api/jobs/route.ts`

- [ ] **Step 1: Implement `app/api/batch/scan/route.ts`**

```typescript
import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import { getDb } from '@/lib/db'
import { parseJd } from '@/lib/jd-parser'
import { scoreJd } from '@/lib/fit-scorer'

export async function POST() {
  const jobsDir = process.env.OBSIDIAN_JOBS_PATH
  if (!jobsDir || !fs.existsSync(jobsDir)) {
    return NextResponse.json({ error: 'OBSIDIAN_JOBS_PATH not set or directory not found' }, { status: 400 })
  }

  const db = getDb()
  const files = fs.readdirSync(jobsDir).filter(f => f.endsWith('.md'))

  const upsert = db.prepare(`
    INSERT INTO jd_jobs (id, file_path, company, role_title, tags, visa_status, role_track, fit_pct, raw_content, scanned_at)
    VALUES (@id, @file_path, @company, @role_title, @tags, @visa_status, @role_track, @fit_pct, @raw_content, CURRENT_TIMESTAMP)
    ON CONFLICT(id) DO UPDATE SET
      file_path   = excluded.file_path,
      tags        = excluded.tags,
      visa_status = excluded.visa_status,
      role_track  = excluded.role_track,
      fit_pct     = excluded.fit_pct,
      raw_content = excluded.raw_content,
      scanned_at  = CURRENT_TIMESTAMP
  `)

  const rows = files.map(file => {
    const filePath = path.join(jobsDir, file)
    const content = fs.readFileSync(filePath, 'utf8')
    const parsed = parseJd(filePath, content)
    const { role_track, fit_pct } = scoreJd(parsed.raw_content)
    return { ...parsed, role_track, fit_pct }
  })

  const scanAll = db.transaction((rs: typeof rows) => {
    for (const r of rs) upsert.run(r)
  })
  scanAll(rows)

  return NextResponse.json({ scanned: rows.length })
}
```

- [ ] **Step 2: Implement `app/api/batch/run/route.ts`**

```typescript
import { getDb } from '@/lib/db'
import { buildJob } from '@/lib/batch-worker'
import fs from 'fs'
import matter from 'gray-matter'
import pLimit from 'p-limit'
import crypto from 'crypto'

export const dynamic = 'force-dynamic'

type JobRow = {
  id: string; file_path: string; company: string; role_title: string
  tags: string; visa_status: string; role_track: string; fit_pct: number; raw_content: string
}

function tagJobFile(filePath: string): void {
  const raw = fs.readFileSync(filePath, 'utf8')
  const { data: fm, content } = matter(raw)
  const tags: string[] = Array.isArray(fm.tags) ? fm.tags : []
  const updated = tags.filter(t => t !== 'un-resume')
  if (!updated.includes('resume-ed')) updated.push('resume-ed')
  fm.tags = updated
  fs.writeFileSync(filePath, matter.stringify(content, fm))
}

export async function POST(req: Request) {
  const { job_ids }: { job_ids: string[] } = await req.json()
  if (!job_ids?.length) return new Response('job_ids required', { status: 400 })

  const db = getDb()
  const limit = pLimit(Number(process.env.BATCH_CONCURRENCY ?? 3))
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))

      const placeholders = job_ids.map(() => '?').join(',')
      const jobs = db.prepare(`SELECT * FROM jd_jobs WHERE id IN (${placeholders})`)
        .all(...job_ids) as JobRow[]

      const insertOutput = db.prepare(`
        INSERT INTO jd_outputs (id, job_id, docx_path, projects_used, work_ids_used, variant, tagline, built_at)
        VALUES (@id, @job_id, @docx_path, @projects_used, @work_ids_used, @variant, @tagline, CURRENT_TIMESTAMP)
      `)

      await Promise.all(jobs.map(job => limit(async () => {
        send({ job_id: job.id, status: 'running', message: `Building ${job.company} — ${job.role_title}` })
        try {
          const result = await buildJob(job)
          insertOutput.run({
            id: crypto.randomUUID(),
            job_id: job.id,
            docx_path: result.docx_path,
            projects_used: JSON.stringify(result.build_params.projects.map(p => p.id)),
            work_ids_used: JSON.stringify(result.build_params.work.map(w => w.id)),
            variant: result.variant,
            tagline: result.build_params.tagline,
          })
          tagJobFile(job.file_path)
          send({ job_id: job.id, status: 'done', message: `✓ ${result.docx_path}` })
        } catch (err) {
          send({ job_id: job.id, status: 'error', message: String(err instanceof Error ? err.message : err) })
        }
      })))

      send({ job_id: null, status: 'complete', message: `Done. ${jobs.length} jobs processed.` })
      controller.close()
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  })
}
```

- [ ] **Step 3: Implement `app/api/jobs/route.ts`**

```typescript
import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export async function GET() {
  const jobs = getDb().prepare(`
    SELECT id, company, role_title, role_track, fit_pct, visa_status, tags
    FROM jd_jobs ORDER BY company ASC
  `).all()
  return NextResponse.json(jobs)
}
```

- [ ] **Step 4: Manual test**

Start `npm run dev`. Then:

```bash
curl -X POST http://localhost:3000/api/batch/scan
```

Expected: `{"scanned": 558}` (or actual count).

- [ ] **Step 5: Commit**

```bash
git add app/api/batch/scan/route.ts app/api/batch/run/route.ts app/api/jobs/route.ts
git commit -m "feat: add batch scan + run SSE APIs and jobs list endpoint"
```

---

## Task 8: Metrics API

**Files:**
- Create: `app/api/metrics/route.ts`

- [ ] **Step 1: Implement route**

```typescript
import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export async function GET() {
  const db = getDb()

  const total = (db.prepare('SELECT COUNT(*) as n FROM jd_jobs').get() as { n: number }).n
  const visaKill = (db.prepare("SELECT COUNT(*) as n FROM jd_jobs WHERE visa_status='kill'").get() as { n: number }).n

  const trackRows = db.prepare(`
    SELECT role_track, COUNT(*) as count FROM jd_jobs
    WHERE role_track IS NOT NULL GROUP BY role_track ORDER BY count DESC
  `).all() as Array<{ role_track: string; count: number }>
  const role_track_dist = Object.fromEntries(trackRows.map(r => [r.role_track, r.count]))

  const fitRows = db.prepare('SELECT fit_pct FROM jd_jobs WHERE fit_pct IS NOT NULL')
    .all() as Array<{ fit_pct: number }>
  const buckets: Record<string, number> = {}
  for (let i = 0; i <= 9; i++) buckets[`${i * 10}-${i * 10 + 9}`] = 0
  for (const { fit_pct } of fitRows) {
    const b = `${Math.floor(fit_pct / 10) * 10}-${Math.floor(fit_pct / 10) * 10 + 9}`
    buckets[b] = (buckets[b] ?? 0) + 1
  }

  const outputs = db.prepare(`
    SELECT o.*, j.company, j.role_title, j.role_track, j.fit_pct as job_fit
    FROM jd_outputs o JOIN jd_jobs j ON o.job_id = j.id
    ORDER BY o.built_at DESC LIMIT 50
  `).all()

  db.prepare(`
    INSERT INTO jd_metrics (computed_at, total_jobs, visa_kill_count, role_track_dist, fit_dist)
    VALUES (CURRENT_TIMESTAMP, ?, ?, ?, ?)
  `).run(total, visaKill, JSON.stringify(role_track_dist), JSON.stringify(buckets))

  return NextResponse.json({ total, visaKill, role_track_dist, fit_dist: buckets, outputs })
}
```

- [ ] **Step 2: Commit**

```bash
git add app/api/metrics/route.ts
git commit -m "feat: add metrics API for dashboard aggregates"
```

---

## Task 9: LiteLLM Client + Chat API

**Files:**
- Create: `lib/llm-client.ts`
- Create: `lib/context-builder.ts`
- Create: `app/api/chat/route.ts`

- [ ] **Step 1: Implement `lib/llm-client.ts`**

```typescript
import OpenAI from 'openai'

let _client: OpenAI | null = null

export function getLlmClient(): OpenAI {
  if (!_client) {
    _client = new OpenAI({
      baseURL: process.env.LITELLM_URL ?? 'http://localhost:4000',
      apiKey: 'not-needed',
    })
  }
  return _client
}
```

- [ ] **Step 2: Implement `lib/context-builder.ts`**

```typescript
import fs from 'fs'
import path from 'path'
import { getDb } from './db'

type ContactInfo = { name: string; email: string; location: string; work_auth: string }
type EduEntry = { display: string }
type ExpEntry = { id: string; company: string }
type ProjEntry = { id: string; name: string }

export function buildSystemPrompt(): string {
  const claudeMd = fs.readFileSync(path.join(process.cwd(), 'CLAUDE.md'), 'utf8')
  const master = JSON.parse(
    fs.readFileSync(path.join(process.cwd(), 'pipeline', 'master_resume_data.json'), 'utf8')
  )

  const contact = master.contact as ContactInfo
  const profile = [
    `Candidate: ${contact.name}`,
    `Email: ${contact.email} | Location: ${contact.location}`,
    `Work auth: ${contact.work_auth}`,
    `Education: ${(master.education as EduEntry[]).map(e => e.display).join('; ')}`,
    `Projects: ${(master.projects as ProjEntry[]).map(p => `${p.id}(${p.name})`).join(', ')}`,
    `Work IDs: ${(master.experience as ExpEntry[]).map(e => `${e.id}(${e.company})`).join(', ')}`,
  ].join('\n')

  const db = getDb()
  const total = (db.prepare('SELECT COUNT(*) as n FROM jd_jobs').get() as { n: number }).n
  const kill = (db.prepare("SELECT COUNT(*) as n FROM jd_jobs WHERE visa_status='kill'").get() as { n: number }).n
  const pending = (db.prepare("SELECT COUNT(*) as n FROM jd_jobs WHERE tags LIKE '%un-resume%'").get() as { n: number }).n

  return [
    '# Resume Pipeline Context',
    '',
    '## Rules (CLAUDE.md excerpt)',
    claudeMd.slice(0, 3000),
    '',
    '## Candidate Profile',
    profile,
    '',
    '## Pipeline Stats',
    `Total JDs: ${total} | Visa-kill: ${kill} | Pending (un-resume): ${pending}`,
  ].join('\n')
}

export function buildSlashContext(command: string, args: string): string {
  const db = getDb()
  if (command === 'jobs') {
    const rows = db.prepare(
      `SELECT id, company, role_title, role_track, fit_pct, visa_status FROM jd_jobs WHERE role_track LIKE ? LIMIT 20`
    ).all(`%${args}%`)
    return `Jobs matching "${args}":\n${JSON.stringify(rows, null, 2)}`
  }
  if (command === 'stats') {
    const m = db.prepare('SELECT * FROM jd_metrics ORDER BY computed_at DESC LIMIT 1').get()
    return `Latest metrics:\n${JSON.stringify(m, null, 2)}`
  }
  if (command === 'resume') {
    const o = db.prepare('SELECT * FROM jd_outputs WHERE job_id = ?').get(args)
    return `Resume output for ${args}:\n${JSON.stringify(o, null, 2)}`
  }
  if (command === 'scan') {
    return 'Scan triggered — POST /api/batch/scan'
  }
  return ''
}
```

- [ ] **Step 3: Implement `app/api/chat/route.ts`**

```typescript
import { getLlmClient } from '@/lib/llm-client'
import { buildSystemPrompt, buildSlashContext } from '@/lib/context-builder'

export const dynamic = 'force-dynamic'

type Msg = { role: 'user' | 'assistant' | 'system'; content: string }

export async function POST(req: Request) {
  const { messages }: { messages: Msg[] } = await req.json()
  if (!messages?.length) return new Response('messages required', { status: 400 })

  const last = messages[messages.length - 1]
  let extra = ''
  const slash = last.content.match(/^\/(\w+)(?:\s+(.*))?$/)
  if (slash) extra = buildSlashContext(slash[1], slash[2] ?? '')

  const system = buildSystemPrompt()
  const fullSystem = extra ? `${system}\n\n## Query Context\n${extra}` : system

  const client = getLlmClient()
  const response = await client.chat.completions.create({
    model: 'local',
    messages: [{ role: 'system', content: fullSystem }, ...messages],
    stream: true,
  })

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      for await (const chunk of response) {
        const text = chunk.choices[0]?.delta?.content ?? ''
        if (text) controller.enqueue(encoder.encode(text))
      }
      controller.close()
    },
  })

  return new Response(stream, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
}
```

- [ ] **Step 4: Commit**

```bash
git add lib/llm-client.ts lib/context-builder.ts app/api/chat/route.ts
git commit -m "feat: add LiteLLM client + streaming chat API with slash commands"
```

---

## Task 10: Config API

**Files:**
- Create: `app/api/config/read/route.ts`
- Create: `app/api/config/write/route.ts`

- [ ] **Step 1: Implement read route**

```typescript
// app/api/config/read/route.ts
import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

const ALLOWED: Record<string, string> = {
  'buildv2.js':               path.join(process.cwd(), 'pipeline', 'buildv2.js'),
  'master_resume_data.json':  path.join(process.cwd(), 'pipeline', 'master_resume_data.json'),
}

export async function GET(req: NextRequest) {
  const file = req.nextUrl.searchParams.get('file')
  if (!file || !ALLOWED[file]) return NextResponse.json({ error: 'Unknown file' }, { status: 400 })
  return NextResponse.json({ content: fs.readFileSync(ALLOWED[file], 'utf8') })
}
```

- [ ] **Step 2: Implement write route**

```typescript
// app/api/config/write/route.ts
import { NextResponse } from 'next/server'
import { checkNodeSyntax } from '@/lib/run-script'
import fs from 'fs'
import path from 'path'
import os from 'os'

const ALLOWED: Record<string, string> = {
  'buildv2.js':               path.join(process.cwd(), 'pipeline', 'buildv2.js'),
  'master_resume_data.json':  path.join(process.cwd(), 'pipeline', 'master_resume_data.json'),
}

export async function POST(req: Request) {
  const { file, content }: { file: string; content: string } = await req.json()
  if (!file || !ALLOWED[file]) return NextResponse.json({ error: 'Unknown file' }, { status: 400 })

  if (file.endsWith('.json')) {
    try { JSON.parse(content) } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
  }

  if (file.endsWith('.js')) {
    const tmp = path.join(os.tmpdir(), `syntax-check-${Date.now()}.js`)
    fs.writeFileSync(tmp, content)
    const result = await checkNodeSyntax(tmp)
    fs.unlinkSync(tmp)
    if (result.code !== 0) {
      return NextResponse.json({ error: `Syntax error: ${result.stderr}` }, { status: 400 })
    }
  }

  const target = ALLOWED[file]
  const backup = target + '.bak'
  if (fs.existsSync(target)) fs.copyFileSync(target, backup)
  fs.writeFileSync(target, content, 'utf8')

  return NextResponse.json({ ok: true, backup })
}
```

- [ ] **Step 3: Commit**

```bash
git add app/api/config/read/route.ts app/api/config/write/route.ts
git commit -m "feat: add config read/write API with backup and syntax validation"
```

---

## Task 11: Layout + Sidebar

**Files:**
- Create: `components/Sidebar.tsx`
- Modify: `app/layout.tsx`

- [ ] **Step 1: Implement `components/Sidebar.tsx`**

```typescript
'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const NAV = [
  { href: '/',       label: 'Dashboard' },
  { href: '/jobs',   label: 'Jobs' },
  { href: '/chat',   label: 'Chat' },
  { href: '/config', label: 'Config' },
]

export function Sidebar() {
  const pathname = usePathname()
  return (
    <nav className="w-44 shrink-0 border-r border-zinc-700 bg-zinc-900 flex flex-col gap-1 p-4">
      <p className="text-xs font-semibold text-zinc-500 uppercase mb-3">ResumeAnalyze</p>
      {NAV.map(({ href, label }) => (
        <Link
          key={href}
          href={href}
          className={`px-3 py-2 rounded text-sm font-medium transition-colors ${
            pathname === href
              ? 'bg-zinc-700 text-white'
              : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
          }`}
        >
          {label}
        </Link>
      ))}
    </nav>
  )
}
```

- [ ] **Step 2: Update `app/layout.tsx`**

```typescript
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { Sidebar } from '@/components/Sidebar'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'ResumeAnalyze',
  description: 'Resume pipeline dashboard',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.className} bg-zinc-950 text-zinc-100 min-h-screen flex`}>
        <Sidebar />
        <main className="flex-1 overflow-auto p-6">{children}</main>
      </body>
    </html>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add components/Sidebar.tsx app/layout.tsx
git commit -m "feat: add sidebar nav and dark root layout"
```

---

## Task 12: Dashboard Page + Charts

**Files:**
- Create: `components/RoleTrackChart.tsx`
- Create: `components/FitDistChart.tsx`
- Create: `components/OutputHistoryTable.tsx`
- Create: `app/page.tsx`

- [ ] **Step 1: Implement `components/RoleTrackChart.tsx`**

```typescript
'use client'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'

export function RoleTrackChart({ data }: { data: Record<string, number> }) {
  const chartData = Object.entries(data)
    .map(([track, count]) => ({ track, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 15)

  return (
    <div className="bg-zinc-900 rounded-lg p-4 border border-zinc-700">
      <h2 className="text-sm font-semibold text-zinc-400 mb-3">Role-Track Distribution</h2>
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={chartData} margin={{ bottom: 60 }}>
          <XAxis dataKey="track" tick={{ fill: '#a1a1aa', fontSize: 10 }} angle={-35} textAnchor="end" interval={0} />
          <YAxis tick={{ fill: '#a1a1aa', fontSize: 11 }} />
          <Tooltip contentStyle={{ background: '#18181b', border: '1px solid #3f3f46', color: '#fff' }} />
          <Bar dataKey="count" fill="#6366f1" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
```

- [ ] **Step 2: Implement `components/FitDistChart.tsx`**

```typescript
'use client'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'

export function FitDistChart({ data }: { data: Record<string, number> }) {
  const chartData = Object.entries(data).map(([bucket, count]) => ({ bucket, count }))

  return (
    <div className="bg-zinc-900 rounded-lg p-4 border border-zinc-700">
      <h2 className="text-sm font-semibold text-zinc-400 mb-3">Fit% Distribution</h2>
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={chartData}>
          <XAxis dataKey="bucket" tick={{ fill: '#a1a1aa', fontSize: 11 }} />
          <YAxis tick={{ fill: '#a1a1aa', fontSize: 11 }} />
          <Tooltip contentStyle={{ background: '#18181b', border: '1px solid #3f3f46', color: '#fff' }} />
          <Bar dataKey="count" fill="#22c55e" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
```

- [ ] **Step 3: Implement `components/OutputHistoryTable.tsx`**

```typescript
interface Output {
  company: string; role_title: string; role_track: string
  job_fit: number; docx_path: string; built_at: string
}

export function OutputHistoryTable({ outputs }: { outputs: Output[] }) {
  return (
    <div className="bg-zinc-900 rounded-lg p-4 border border-zinc-700">
      <h2 className="text-sm font-semibold text-zinc-400 mb-3">Resume Output History</h2>
      <div className="overflow-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-zinc-500 border-b border-zinc-700">
              <th className="pb-2 pr-4">Company</th>
              <th className="pb-2 pr-4">Role</th>
              <th className="pb-2 pr-4">Track</th>
              <th className="pb-2 pr-4">Fit%</th>
              <th className="pb-2">Built</th>
            </tr>
          </thead>
          <tbody>
            {outputs.map((o, i) => (
              <tr key={i} className="border-b border-zinc-800 hover:bg-zinc-800/50">
                <td className="py-2 pr-4 text-zinc-200">{o.company}</td>
                <td className="py-2 pr-4 text-zinc-300">{o.role_title}</td>
                <td className="py-2 pr-4 text-zinc-400 text-xs">{o.role_track}</td>
                <td className="py-2 pr-4">
                  <span className={o.job_fit >= 60 ? 'text-green-400' : 'text-zinc-400'}>{o.job_fit}%</span>
                </td>
                <td className="py-2 text-zinc-500 text-xs">{new Date(o.built_at).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {outputs.length === 0 && <p className="text-zinc-600 text-sm mt-4">No resumes built yet.</p>}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Implement `app/page.tsx`**

```typescript
import { RoleTrackChart } from '@/components/RoleTrackChart'
import { FitDistChart } from '@/components/FitDistChart'
import { OutputHistoryTable } from '@/components/OutputHistoryTable'

async function getMetrics() {
  try {
    const res = await fetch('http://localhost:3000/api/metrics', { cache: 'no-store' })
    return res.ok ? res.json() : null
  } catch { return null }
}

export default async function DashboardPage() {
  const data = await getMetrics()

  if (!data) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-semibold">Dashboard</h1>
        <p className="text-zinc-500 text-sm">
          No data yet.{' '}
          <a href="/jobs" className="text-indigo-400 underline">Go to Jobs → Scan</a> to populate.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Dashboard</h1>
        <p className="text-sm text-zinc-500">{data.total} JDs · {data.visaKill} visa-kill</p>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <RoleTrackChart data={data.role_track_dist} />
        <FitDistChart data={data.fit_dist} />
      </div>
      <OutputHistoryTable outputs={data.outputs} />
    </div>
  )
}
```

- [ ] **Step 5: Commit**

```bash
git add components/RoleTrackChart.tsx components/FitDistChart.tsx components/OutputHistoryTable.tsx app/page.tsx
git commit -m "feat: add dashboard page with charts and output history"
```

---

## Task 13: Jobs Page

**Files:**
- Create: `app/jobs/page.tsx`

- [ ] **Step 1: Implement `app/jobs/page.tsx`**

```typescript
'use client'
import { useState, useEffect } from 'react'

interface Job {
  id: string; company: string; role_title: string
  role_track: string; fit_pct: number; visa_status: string; tags: string
}
interface BatchEvent { job_id: string | null; status: string; message: string }

export default function JobsPage() {
  const [jobs, setJobs] = useState<Job[]>([])
  const [filter, setFilter] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [log, setLog] = useState<BatchEvent[]>([])
  const [running, setRunning] = useState(false)

  const reload = () =>
    fetch('/api/jobs').then(r => r.ok ? r.json() : []).then(setJobs)

  useEffect(() => { reload() }, [])

  const pending = jobs.filter(j => {
    const tags: string[] = JSON.parse(j.tags ?? '[]')
    const q = filter.toLowerCase()
    const matchesFilter = !q
      || j.company.toLowerCase().includes(q)
      || j.role_title.toLowerCase().includes(q)
      || (j.role_track ?? '').toLowerCase().includes(q)
    return tags.includes('un-resume') && j.visa_status !== 'kill' && matchesFilter
  })

  const toggle = (id: string) =>
    setSelected(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })

  const scan = async () => {
    await fetch('/api/batch/scan', { method: 'POST' })
    reload()
  }

  const runBatch = async () => {
    if (!selected.size) return
    setRunning(true); setLog([])
    const res = await fetch('/api/batch/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ job_ids: [...selected] }),
    })
    const reader = res.body!.getReader()
    const dec = new TextDecoder()
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      for (const line of dec.decode(value).split('\n')) {
        if (line.startsWith('data: ')) {
          try { setLog(p => [...p, JSON.parse(line.slice(6))]) } catch {}
        }
      }
    }
    setRunning(false); setSelected(new Set()); reload()
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-semibold">Jobs</h1>
        <span className="text-sm text-zinc-500">{pending.length} pending</span>
        <button onClick={scan} className="ml-auto text-sm px-3 py-1 bg-zinc-700 hover:bg-zinc-600 rounded">Scan</button>
        <button
          onClick={runBatch}
          disabled={!selected.size || running}
          className="text-sm px-3 py-1 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 rounded"
        >
          {running ? 'Running…' : `Build ${selected.size || ''} selected`}
        </button>
      </div>

      <input
        value={filter}
        onChange={e => setFilter(e.target.value)}
        placeholder="Filter by company, role, or track…"
        className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm"
      />

      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-zinc-500 border-b border-zinc-700">
            <th className="pb-2 pr-2 w-8"></th>
            <th className="pb-2 pr-4">Company</th>
            <th className="pb-2 pr-4">Role</th>
            <th className="pb-2 pr-4">Track</th>
            <th className="pb-2 pr-4">Fit%</th>
            <th className="pb-2">Visa</th>
          </tr>
        </thead>
        <tbody>
          {pending.map(job => (
            <tr key={job.id} className="border-b border-zinc-800 hover:bg-zinc-800/40">
              <td className="py-2 pr-2">
                <input type="checkbox" checked={selected.has(job.id)} onChange={() => toggle(job.id)} className="accent-indigo-500" />
              </td>
              <td className="py-2 pr-4 text-zinc-200">{job.company}</td>
              <td className="py-2 pr-4 text-zinc-300">{job.role_title}</td>
              <td className="py-2 pr-4 text-zinc-400 text-xs">{job.role_track}</td>
              <td className="py-2 pr-4">
                <span className={job.fit_pct >= 60 ? 'text-green-400' : 'text-zinc-400'}>{job.fit_pct}%</span>
              </td>
              <td className="py-2">
                <span className={job.visa_status === 'kill' ? 'text-red-400' : 'text-green-400'}>{job.visa_status}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {log.length > 0 && (
        <div className="bg-zinc-900 border border-zinc-700 rounded p-3 font-mono text-xs space-y-1">
          {log.map((e, i) => (
            <div key={i} className={e.status === 'error' ? 'text-red-400' : e.status === 'done' ? 'text-green-400' : 'text-zinc-300'}>
              {e.message}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add app/jobs/page.tsx
git commit -m "feat: add jobs page with filter, batch select, and SSE build log"
```

---

## Task 14: Chat Page

**Files:**
- Create: `app/chat/page.tsx`

- [ ] **Step 1: Implement `app/chat/page.tsx`**

```typescript
'use client'
import { useState, useRef, useEffect } from 'react'

type Msg = { role: 'user' | 'assistant'; content: string }

export default function ChatPage() {
  const [messages, setMessages] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  const send = async () => {
    const text = input.trim()
    if (!text || loading) return
    setInput('')
    const next: Msg[] = [...messages, { role: 'user', content: text }]
    setMessages(next)
    setLoading(true)
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: next }),
    })
    const reader = res.body!.getReader()
    const dec = new TextDecoder()
    let reply = ''
    setMessages(p => [...p, { role: 'assistant', content: '' }])
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      reply += dec.decode(value)
      setMessages(p => [...p.slice(0, -1), { role: 'assistant', content: reply }])
    }
    setLoading(false)
  }

  return (
    <div className="flex flex-col h-[calc(100vh-3rem)]">
      <h1 className="text-xl font-semibold mb-2">Chat</h1>
      <p className="text-xs text-zinc-600 mb-4">
        <code>/jobs [track]</code> · <code>/stats</code> · <code>/resume [job_id]</code> · <code>/scan</code>
      </p>
      <div className="flex-1 overflow-auto space-y-3 mb-4">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-2xl rounded-lg px-4 py-2 text-sm whitespace-pre-wrap ${
              m.role === 'user' ? 'bg-indigo-600 text-white' : 'bg-zinc-800 text-zinc-100'
            }`}>
              {m.content || <span className="text-zinc-500">…</span>}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      <div className="flex gap-2">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
          placeholder="Ask about your pipeline or type /stats…"
          disabled={loading}
          className="flex-1 bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
        />
        <button
          onClick={send}
          disabled={loading || !input.trim()}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 rounded text-sm"
        >
          Send
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add app/chat/page.tsx
git commit -m "feat: add streaming chat page with slash command support"
```

---

## Task 15: Config Page

**Files:**
- Create: `app/config/page.tsx`

- [ ] **Step 1: Implement `app/config/page.tsx`**

```typescript
'use client'
import { useState, useEffect } from 'react'

type FileKey = 'buildv2.js' | 'master_resume_data.json'

function ConfigEditor({ file }: { file: FileKey }) {
  const [content, setContent] = useState('')
  const [status, setStatus] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/config/read?file=${file}`)
      .then(r => r.json())
      .then(d => { setContent(d.content ?? ''); setLoading(false) })
  }, [file])

  const save = async () => {
    setStatus('Saving…')
    const res = await fetch('/api/config/write', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file, content }),
    })
    const d = await res.json()
    setStatus(res.ok ? `✓ Saved (backup: ${d.backup})` : `✗ ${d.error}`)
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-zinc-400 font-mono">{file}</h2>
        <div className="flex items-center gap-3">
          {status && <span className="text-xs text-zinc-500">{status}</span>}
          <button onClick={save} className="text-sm px-3 py-1 bg-indigo-600 hover:bg-indigo-500 rounded">Save</button>
        </div>
      </div>
      <textarea
        value={loading ? 'Loading…' : content}
        onChange={e => setContent(e.target.value)}
        disabled={loading}
        className="w-full h-96 bg-zinc-900 border border-zinc-700 rounded px-3 py-2 font-mono text-xs text-zinc-300 focus:outline-none focus:border-indigo-500 resize-y"
        spellCheck={false}
      />
    </div>
  )
}

export default function ConfigPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold">Config</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Edit pipeline files. A <code>.bak</code> backup is created before every save. JSON and JS syntax validated before writing.
        </p>
      </div>
      <ConfigEditor file="master_resume_data.json" />
      <ConfigEditor file="buildv2.js" />
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add app/config/page.tsx
git commit -m "feat: add config editor for master_resume_data.json and buildv2.js"
```

---

## Task 16: End-to-End Smoke Test

- [ ] **Step 1: Start dev server**

```bash
npm run dev
```

Expected: `▲ Next.js 14.x` on `http://localhost:3000`.

- [ ] **Step 2: Verify all pages render**

Open browser:
- `http://localhost:3000` — Dashboard (shows "No data yet" message)
- `http://localhost:3000/jobs` — Jobs page with Scan button
- `http://localhost:3000/chat` — Chat input visible
- `http://localhost:3000/config` — Both editors load

- [ ] **Step 3: Run scan**

Click Scan on Jobs page. Confirm job count in console log. Filter by "SRE" — verify rows filter.

- [ ] **Step 4: Build one resume**

Select 1 pending job. Click "Build 1 selected". Watch SSE log. Verify DOCX at `~/Desktop/Resume Templates/`.

- [ ] **Step 5: Verify dashboard populates**

Reload dashboard. Charts should show role-track and fit% distributions.

- [ ] **Step 6: Test chat (requires LiteLLM + Ollama)**

```bash
# Terminal 2: start LiteLLM
litellm --config litellm_config.yaml --port 4000
```

In chat, type `/stats`. Expect pipeline stats returned.

- [ ] **Step 7: Run all unit tests**

```bash
npx vitest run
```

Expected: 11 tests pass (jd-parser: 5, fit-scorer: 3, db: 3).

- [ ] **Step 8: Final commit**

```bash
git add -A
git commit -m "feat: complete ResumeAnalyze full-stack — dashboard, jobs, chat, config"
```

---

## LiteLLM Setup Reference

Create `litellm_config.yaml` (add to `.gitignore` if it contains API keys):

```yaml
model_list:
  - model_name: local
    litellm_params:
      model: ollama/llama3.1
      api_base: http://localhost:11434
```

```bash
pip install litellm
ollama serve          # if not already running
ollama pull llama3.1  # or any model you prefer
litellm --config litellm_config.yaml --port 4000
```

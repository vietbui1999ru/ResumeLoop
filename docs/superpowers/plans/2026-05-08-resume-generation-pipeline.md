# Resume Generation Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a resume generation pipeline to the dashboard — checkbox job selection, Anthropic SDK reasoning, node subprocess DOCX build, SSE streaming progress, feedback/ranking UI, and config page reference doc editors.

**Architecture:** POST /api/generate validates selected jobs; client opens one SSE stream per job sequentially; each stream runs a 6-stage pipeline (ai-reason → write-script → build → validate → fix-loop → finalize); Anthropic SDK tool-use enforces structured JSON output; `harness/batch-build/` is the working dir for node subprocess execution.

**Tech Stack:** Next.js 14 App Router, TypeScript, `@anthropic-ai/sdk`, `better-sqlite3`, Vitest, Tailwind CSS

---

## File Map

**New files:**
- `lib/prompt-context.ts` — assembles system prompt from master data + docs + feedback history
- `lib/ai-reason.ts` — Anthropic SDK tool-use call → `ReasoningResult`
- `lib/generate-pipeline.ts` — 6-stage AsyncGenerator pipeline
- `app/api/generate/route.ts` — POST: validate jobIds, return queue
- `app/api/generate/[jobId]/stream/route.ts` — GET: SSE pipeline runner
- `app/api/generate/[jobId]/download/route.ts` — GET: stream DOCX from db path
- `app/api/generate/feedback/route.ts` — POST: append to feedback/raw-log.md
- `components/GenerationPanel.tsx` — SSE consumer, per-job progress rows, rating UI

**Modified files:**
- `app/api/config/read/route.ts` — add `PATHS.docs.*` entries to ALLOWED
- `app/api/config/write/route.ts` — same, no syntax validation for .md
- `app/config/page.tsx` — add Reference Docs section
- `app/jobs/page.tsx` — add checkboxes, "Generate N" button, Status column

---

## Key Data Shapes

**master_resume_data.json structure:**
```typescript
// experience[i].bullets is an object, not array — keyed by variant
// experience[i].bullets.genai    → string[]  (5 bullets for genai variant)
// experience[i].bullets.systems  → string[]  (5 bullets for systems variant)
// experience[i].bullets.fullstack, .sre also exist

// projects[i].bullets is a flat string[]  (use first 3)

// skills is an object keyed by variant: skills.genai, skills.systems, etc.
// Each value is an object { "Languages": "Go · Python · ...", "Frameworks": "..." }
```

**ReasoningResult (AI output):**
```typescript
interface ReasoningResult {
  track: string           // e.g. "systems"
  workVariant: string     // "genai" | "systems" | "IT-track"
  workIds: string[]       // exactly 3 valid IDs
  projects: string[]      // exactly 3 project IDs
  personaTitle: string    // ≤60 chars
  tagline: string         // ≤76 chars
  skillsRows: string[]    // exactly 5 plain strings
}
```

**SSEEvent:**
```typescript
interface SSEEvent {
  stage: 'preflight' | 'ai-reason' | 'write-script' | 'build' | 'validate' | 'fix-loop' | 'finalize' | 'done' | 'error'
  status: 'ok' | 'fail' | 'running'
  data: Record<string, unknown>
}
```

**Build script template** (written by write-script stage):
```js
const { makeDoc, TL } = require('./buildv2.js');
const { Packer } = require('docx');
const fs = require('fs');
const path = require('path');

const doc = makeDoc({
  tagline: TL('TAGLINE_HERE'),
  work: [
    { id: 'gitlab',       bullets: [/* 5 exact strings from master data */] },
    { id: 'carboncopies', bullets: [/* 5 exact strings */] },
    { id: 'udayton',      bullets: [/* 5 exact strings */] },
  ],
  projects: [
    { id: 'outfit_tracker', bullets: [/* 3 exact strings */] },
    // ...
  ],
  skills: ['Row1: Python · Go · ...', /* 5 rows */]
});

Packer.toBuffer(doc).then(buf => {
  const out = path.join(__dirname, 'FILENAME_VietBui.docx');
  fs.writeFileSync(out, buf);
  console.log('✓', out);
});
```

---

## Task 1: Install Anthropic SDK

**Files:**
- Modify: `package.json`
- Modify: `.env.local`

- [ ] **Install SDK**
  ```bash
  cd /Users/vietquocbui/repos/ResumeAnalyze && npm install @anthropic-ai/sdk
  ```
  Expected: `added 1 package` (or similar), no errors.

- [ ] **Add API key placeholder to .env.local**
  Read `.env.local` first, then add if `ANTHROPIC_API_KEY` not already present:
  ```
  ANTHROPIC_API_KEY=sk-ant-...
  ```
  > Note: key must already be set in the environment — this just ensures it's in the file.

- [ ] **Verify types are available**
  ```bash
  npx tsc --noEmit 2>&1 | head -5
  ```
  Expected: no output (clean).

- [ ] **Commit**
  ```bash
  git add package.json package-lock.json .env.local
  git commit -m "chore: add @anthropic-ai/sdk dependency"
  ```

---

## Task 2: lib/prompt-context.ts

**Files:**
- Create: `lib/prompt-context.ts`
- Create: `lib/prompt-context.test.ts`

The system prompt assembler reads 4 sources: master data JSON, CLAUDE-full.md, ats-optimization-guidelines.md, and feedback history. Result is a long string passed as the system prompt to the AI.

- [ ] **Write failing test**

  Create `lib/prompt-context.test.ts`:
  ```typescript
  import { describe, it, expect, vi } from 'vitest'
  import fs from 'fs'

  vi.mock('fs')

  describe('buildSystemPrompt', () => {
    it('includes master data content in output', async () => {
      vi.mocked(fs.readFileSync).mockImplementation((p: unknown) => {
        if (String(p).includes('master_resume_data')) return '{"experience":[],"projects":[],"skills":{}}'
        if (String(p).includes('CLAUDE-full')) return '## Role-Track Table\n...'
        if (String(p).includes('ats-optimization')) return '## ATS Guidelines\n...'
        return ''
      })
      vi.mocked(fs.existsSync).mockReturnValue(false)

      const { buildSystemPrompt } = await import('./prompt-context')
      const prompt = buildSystemPrompt()

      expect(prompt).toContain('master_resume_data')
      expect(prompt).toContain('Role-Track Table')
      expect(prompt).toContain('ATS Guidelines')
      expect(prompt).toContain('track')
      expect(prompt).toContain('workVariant')
      expect(prompt).toContain('tagline')
      expect(prompt).toContain('skillsRows')
    })

    it('uses synthesized-rules.md when it exists', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockImplementation((p: unknown) => {
        if (String(p).includes('synthesized-rules')) return '## Rule: never use generic taglines'
        return '{}'
      })

      const { buildSystemPrompt } = await import('./prompt-context')
      const prompt = buildSystemPrompt()
      expect(prompt).toContain('never use generic taglines')
    })
  })
  ```

- [ ] **Run test to verify it fails**
  ```bash
  npx vitest run lib/prompt-context.test.ts 2>&1 | tail -10
  ```
  Expected: FAIL — `Cannot find module './prompt-context'`

- [ ] **Implement lib/prompt-context.ts**

  ```typescript
  import fs from 'fs'
  import path from 'path'
  import { PATHS } from './paths'

  export function buildSystemPrompt(): string {
    const masterData    = fs.readFileSync(PATHS.pipeline.masterData, 'utf8')
    const atsGuidelines = fs.readFileSync(PATHS.docs.atsGuidelines, 'utf8')
    const claudeFull    = fs.readFileSync(PATHS.docs.claudeFull, 'utf8')
    const feedback      = loadFeedbackContext()

    return `You are a resume tailoring expert for candidate Quoc-Viet Bui.
  Use the tool \`resume_decision\` to return your selections. Do not output anything else.

  ## Candidate Profile & All Bullet Data
  ${masterData}

  ## Hard Constraints (MUST NOT violate)
  - tagline: ≤76 characters WITH spaces — count carefully
  - personaTitle: ≤60 chars, must NOT match the JD job title verbatim
  - workIds: exactly 3 IDs from ["gitlab","carboncopies","udayton","augustana"]
  - projects: exactly 3 project IDs that exist in the profile data above
  - skillsRows: exactly 5 plain strings formatted "Tech · Tech · Tech"
  - IT-track: workIds must include "augustana" as first entry

  ## Role-Track Mapping & Work Variants
  (Use this section to map the JD role to the correct track and workVariant)
  ${claudeFull}

  ## ATS Optimization Guidelines
  ${atsGuidelines}

  ## Mistake History — Avoid Repeating
  ${feedback}`
  }

  function loadFeedbackContext(): string {
    const synthesized = path.join(process.cwd(), 'feedback', 'synthesized-rules.md')
    const rawLog      = path.join(process.cwd(), 'feedback', 'raw-log.md')

    if (fs.existsSync(synthesized)) {
      return fs.readFileSync(synthesized, 'utf8')
    }
    if (!fs.existsSync(rawLog)) return '(no feedback history yet)'

    const raw     = fs.readFileSync(rawLog, 'utf8')
    const entries = raw.split(/^## /m).filter(s => s.trim() && !s.startsWith('#'))
    const last10  = entries.slice(-10)
    return last10.length ? last10.map(e => `## ${e}`).join('') : '(no entries yet)'
  }
  ```

- [ ] **Run test to verify it passes**
  ```bash
  npx vitest run lib/prompt-context.test.ts 2>&1 | tail -10
  ```
  Expected: PASS

- [ ] **Typecheck**
  ```bash
  npx tsc --noEmit 2>&1
  ```
  Expected: no output.

- [ ] **Commit**
  ```bash
  git add lib/prompt-context.ts lib/prompt-context.test.ts
  git commit -m "feat: add prompt-context assembler"
  ```

---

## Task 3: lib/ai-reason.ts

**Files:**
- Create: `lib/ai-reason.ts`
- Create: `lib/ai-reason.test.ts`

Uses Anthropic SDK tool-use (structured outputs) to enforce the JSON schema. Includes prompt caching on the large system prompt.

- [ ] **Write failing test**

  Create `lib/ai-reason.test.ts`:
  ```typescript
  import { describe, it, expect, vi } from 'vitest'

  vi.mock('@anthropic-ai/sdk', () => ({
    default: vi.fn().mockImplementation(() => ({
      messages: {
        create: vi.fn().mockResolvedValue({
          content: [{
            type: 'tool_use',
            name: 'resume_decision',
            input: {
              track: 'systems',
              workVariant: 'systems',
              workIds: ['gitlab', 'carboncopies', 'udayton'],
              projects: ['homelab', 'eth_switch', 'claude_tui'],
              personaTitle: 'Software Engineer — distributed systems',
              tagline: 'Software Engineer building distributed systems with Go',
              skillsRows: ['Go · Python · Rust', 'React · FastAPI', 'Docker · k8s', 'PostgreSQL · SQLite', 'Prometheus · Grafana'],
            }
          }]
        })
      }
    }))
  }))
  vi.mock('./prompt-context', () => ({ buildSystemPrompt: () => 'system prompt' }))

  describe('reasonForJob', () => {
    it('returns parsed ReasoningResult from tool_use response', async () => {
      const { reasonForJob } = await import('./ai-reason')
      const result = await reasonForJob('JD content here')

      expect(result.track).toBe('systems')
      expect(result.workIds).toHaveLength(3)
      expect(result.projects).toHaveLength(3)
      expect(result.skillsRows).toHaveLength(5)
      expect(result.tagline.length).toBeLessThanOrEqual(76)
    })

    it('throws if workIds length !== 3', async () => {
      const Anthropic = (await import('@anthropic-ai/sdk')).default
      vi.mocked(Anthropic).mockImplementationOnce(() => ({
        messages: {
          create: vi.fn().mockResolvedValue({
            content: [{ type: 'tool_use', name: 'resume_decision', input: { workIds: ['only-one'] } }]
          })
        }
      }) as never)

      const { reasonForJob } = await import('./ai-reason')
      await expect(reasonForJob('jd')).rejects.toThrow('workIds')
    })
  })
  ```

- [ ] **Run test to verify it fails**
  ```bash
  npx vitest run lib/ai-reason.test.ts 2>&1 | tail -10
  ```
  Expected: FAIL — `Cannot find module './ai-reason'`

- [ ] **Implement lib/ai-reason.ts**

  ```typescript
  import Anthropic from '@anthropic-ai/sdk'
  import { buildSystemPrompt } from './prompt-context'

  export interface ReasoningResult {
    track: string
    workVariant: string
    workIds: string[]
    projects: string[]
    personaTitle: string
    tagline: string
    skillsRows: string[]
  }

  const VALID_WORK_IDS = ['gitlab', 'carboncopies', 'udayton', 'augustana']

  const TOOL_SCHEMA: Anthropic.Tool = {
    name: 'resume_decision',
    description: 'Select resume components tailored to this job posting',
    input_schema: {
      type: 'object' as const,
      properties: {
        track:        { type: 'string', description: 'Role track from the role-track table' },
        workVariant:  { type: 'string', enum: ['genai', 'systems', 'IT-track'] },
        workIds:      { type: 'array', items: { type: 'string', enum: VALID_WORK_IDS }, minItems: 3, maxItems: 3 },
        projects:     { type: 'array', items: { type: 'string' }, minItems: 3, maxItems: 3 },
        personaTitle: { type: 'string', maxLength: 60 },
        tagline:      { type: 'string', maxLength: 76 },
        skillsRows:   { type: 'array', items: { type: 'string' }, minItems: 5, maxItems: 5 },
      },
      required: ['track', 'workVariant', 'workIds', 'projects', 'personaTitle', 'tagline', 'skillsRows'],
    },
  }

  export async function reasonForJob(rawContent: string): Promise<ReasoningResult> {
    const client = new Anthropic()
    const systemPrompt = buildSystemPrompt()

    const response = await client.messages.create({
      model: 'claude-opus-4-7',
      max_tokens: 2048,
      system: [
        {
          type: 'text',
          text: systemPrompt,
          cache_control: { type: 'ephemeral' },
        },
      ],
      tools: [TOOL_SCHEMA],
      tool_choice: { type: 'tool', name: 'resume_decision' },
      messages: [
        {
          role: 'user',
          content: `Job Description:\n\n${rawContent}`,
        },
      ],
    })

    const toolUse = response.content.find(b => b.type === 'tool_use')
    if (!toolUse || toolUse.type !== 'tool_use') {
      throw new Error('No tool_use block in AI response')
    }

    const result = toolUse.input as ReasoningResult
    validateResult(result)
    return result
  }

  function validateResult(r: ReasoningResult): void {
    if (!r.workIds || r.workIds.length !== 3) throw new Error(`workIds must have 3 entries, got ${r.workIds?.length}`)
    if (!r.projects || r.projects.length !== 3) throw new Error(`projects must have 3 entries, got ${r.projects?.length}`)
    if (!r.skillsRows || r.skillsRows.length !== 5) throw new Error(`skillsRows must have 5 entries, got ${r.skillsRows?.length}`)
    if (r.tagline.length > 76) throw new Error(`tagline too long: ${r.tagline.length} chars`)
    if (r.personaTitle.length > 60) throw new Error(`personaTitle too long: ${r.personaTitle.length} chars`)
  }
  ```

- [ ] **Run test to verify it passes**
  ```bash
  npx vitest run lib/ai-reason.test.ts 2>&1 | tail -10
  ```
  Expected: PASS

- [ ] **Commit**
  ```bash
  git add lib/ai-reason.ts lib/ai-reason.test.ts
  git commit -m "feat: add AI reasoning module with Anthropic tool-use"
  ```

---

## Task 4: lib/generate-pipeline.ts

**Files:**
- Create: `lib/generate-pipeline.ts`

Orchestrates the 6 stages. Yields SSEEvent objects from an AsyncGenerator. Reads master_resume_data.json to look up bullets when writing the build script.

- [ ] **Read pipeline/master_resume_data.json to understand bullet access pattern**

  Run to confirm bullet access:
  ```bash
  node -e "
  const d = require('./pipeline/master_resume_data.json')
  const exp = d.experience.find(e => e.id === 'gitlab')
  console.log('gitlab genai bullets:', exp.bullets.genai.slice(0,2))
  const proj = d.projects.find(p => p.id === 'homelab')
  console.log('homelab bullets:', proj.bullets.slice(0,2))
  console.log('skills.systems keys:', Object.keys(d.skills.systems))
  "
  ```
  Expected: printed bullet strings. Confirm the variant key maps (genai/systems/IT-track → match `skills` keys; IT-track likely maps to `sre_devops`).

- [ ] **Implement lib/generate-pipeline.ts**

  ```typescript
  import fs from 'fs'
  import path from 'path'
  import { spawn } from 'child_process'
  import { randomUUID } from 'crypto'
  import { reasonForJob, type ReasoningResult } from './ai-reason'
  import { getDb } from './db'
  import { getSetting } from './settings'
  import { PATHS } from './paths'

  export interface SSEEvent {
    stage: 'preflight' | 'ai-reason' | 'write-script' | 'build' | 'validate' | 'fix-loop' | 'finalize' | 'done' | 'error'
    status: 'ok' | 'fail' | 'running'
    data: Record<string, unknown>
  }

  const BATCH_BUILD = path.join(process.cwd(), 'harness', 'batch-build')
  const VALIDATE_JS = path.join(process.cwd(), 'harness', 'validate.js')

  export async function* runPipeline(jobId: string): AsyncGenerator<SSEEvent> {
    // Load job
    const job = getDb().prepare(
      'SELECT id, company, role_title, file_path, raw_content FROM jd_jobs WHERE id = ?'
    ).get(jobId) as { id: string; company: string; role_title: string; file_path: string; raw_content: string } | undefined

    if (!job) { yield errEvent('preflight', `Job not found: ${jobId}`); return }

    // Stage 0: Preflight — ensure batch-build is ready
    yield { stage: 'preflight', status: 'running', data: {} }
    try {
      await preflight()
    } catch (e) {
      yield errEvent('preflight', String(e)); return
    }
    yield { stage: 'preflight', status: 'ok', data: {} }

    // Stage 1: AI reasoning
    yield { stage: 'ai-reason', status: 'running', data: {} }
    let decision: ReasoningResult
    try {
      decision = await reasonForJob(job.raw_content)
    } catch (e) {
      yield errEvent('ai-reason', String(e)); return
    }
    yield { stage: 'ai-reason', status: 'ok', data: decision as unknown as Record<string, unknown> }

    // Stage 2: Write build script
    yield { stage: 'write-script', status: 'running', data: {} }
    const slug = toSlug(`${job.company}_${job.role_title}`)
    const scriptName = `${slug}.js`
    const scriptPath = path.join(BATCH_BUILD, scriptName)
    const docxName   = `${slug}_VietBui.docx`

    try {
      const script = buildScript(decision, slug, docxName)
      fs.writeFileSync(scriptPath, script, 'utf8')
    } catch (e) {
      yield errEvent('write-script', String(e)); return
    }
    yield { stage: 'write-script', status: 'ok', data: { script: scriptName } }

    // Stages 3+4+5: Build → Validate → Fix loop
    let docxPath: string | null = null
    for await (const event of buildValidateLoop(scriptPath, docxName)) {
      yield event
      if (event.stage === 'finalize' && event.status === 'ok') {
        docxPath = event.data.docx as string
      }
      if (event.status === 'fail') return
    }

    if (!docxPath) { yield errEvent('finalize', 'DOCX path not set after pipeline'); return }

    // Stage 6: DB + tag JD
    yield { stage: 'finalize', status: 'running', data: {} }
    try {
      const outputId = randomUUID()
      const outputDir = getSetting('output_path')
      const destPath  = path.join(outputDir, docxName)

      fs.mkdirSync(outputDir, { recursive: true })
      fs.renameSync(docxPath, destPath)

      getDb().prepare(`
        INSERT OR REPLACE INTO jd_outputs
          (id, job_id, docx_path, projects_used, work_ids_used, variant, tagline, built_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `).run(
        outputId, jobId, destPath,
        JSON.stringify(decision.projects),
        JSON.stringify(decision.workIds),
        decision.workVariant,
        decision.tagline
      )

      tagJdFile(job.file_path)

      yield { stage: 'finalize', status: 'ok', data: { path: destPath } }
      yield { stage: 'done', status: 'ok', data: { outputId } }
    } catch (e) {
      yield errEvent('finalize', String(e))
    }
  }

  async function preflight(): Promise<void> {
    fs.mkdirSync(BATCH_BUILD, { recursive: true })
    fs.copyFileSync(PATHS.pipeline.masterData, path.join(BATCH_BUILD, 'master_resume_data.json'))
    fs.copyFileSync(PATHS.pipeline.builder,    path.join(BATCH_BUILD, 'buildv2.js'))

    const nodeModules = path.join(BATCH_BUILD, 'node_modules')
    if (!fs.existsSync(nodeModules)) {
      await spawnAsync('npm', ['install'], BATCH_BUILD)
    }
  }

  async function* buildValidateLoop(scriptPath: string, docxName: string): AsyncGenerator<SSEEvent> {
    const docxExpected = path.join(BATCH_BUILD, docxName)

    for (let attempt = 0; attempt < 3; attempt++) {
      // Build
      yield { stage: 'build', status: 'running', data: { attempt } }
      const buildResult = await spawnAsync('node', [scriptPath], BATCH_BUILD)
      if (buildResult.code !== 0) {
        yield errEvent('build', buildResult.stderr || buildResult.stdout); return
      }
      yield { stage: 'build', status: 'ok', data: { script: path.basename(scriptPath), attempt } }

      // Validate
      yield { stage: 'validate', status: 'running', data: {} }
      const validateResult = await spawnAsync('node', [VALIDATE_JS, scriptPath], process.cwd())
      if (validateResult.code === 0) {
        // All good — set docx path
        yield { stage: 'validate', status: 'ok', data: {} }
        yield { stage: 'finalize', status: 'ok', data: { docx: docxExpected } }
        return
      }

      // Parse violations and auto-fix
      const violations = validateResult.stdout.split('\n').filter(l => l.startsWith('FAIL'))
      yield { stage: 'validate', status: 'fail', data: { violations } }

      yield { stage: 'fix-loop', status: 'running', data: { violations } }
      const fixed = applyFixes(scriptPath, violations)
      if (fixed.length === 0) {
        yield errEvent('fix-loop', `Unfixable violations: ${violations.join(', ')}`); return
      }
      yield { stage: 'fix-loop', status: 'ok', data: { fixed } }
    }

    yield errEvent('fix-loop', 'Exceeded 3 fix attempts')
  }

  function applyFixes(scriptPath: string, violations: string[]): string[] {
    let src = fs.readFileSync(scriptPath, 'utf8')
    const fixed: string[] = []

    for (const v of violations) {
      // tagline too long: trim to last word boundary ≤76
      const tlMatch = v.match(/FAIL tagline: (\d+)c/)
      if (tlMatch) {
        src = src.replace(/TL\((['"])((?:\\.|(?!\1).)*)\1\)/, (_match, q, val) => {
          let trimmed = val.slice(0, 76)
          const lastSpace = trimmed.lastIndexOf(' ')
          if (lastSpace > 60) trimmed = trimmed.slice(0, lastSpace)
          fixed.push(`tagline trimmed to ${trimmed.length} chars`)
          return `TL(${q}${trimmed}${q})`
        })
      }
      // bullet > 116: flag as error (shouldn't happen — bullets from pre-validated master data)
      if (v.includes('FAIL bullet')) {
        fixed.length = 0  // signal unfixable
        return []
      }
    }

    fs.writeFileSync(scriptPath, src, 'utf8')
    return fixed
  }

  function buildScript(d: ReasoningResult, slug: string, docxName: string): string {
    const master = JSON.parse(fs.readFileSync(PATHS.pipeline.masterData, 'utf8')) as {
      experience: Array<{ id: string; bullets: Record<string, string[]> }>
      projects:   Array<{ id: string; bullets: string[] }>
      skills:     Record<string, Record<string, string>>
    }

    // Resolve variant key for skills (IT-track → sre_devops)
    const skillsKey = d.workVariant === 'IT-track' ? 'sre_devops' : d.workVariant

    const workEntries = d.workIds.map(id => {
      const exp = master.experience.find(e => e.id === id)
      if (!exp) throw new Error(`Unknown work id: ${id}`)
      const bullets = exp.bullets[d.workVariant] ?? exp.bullets['genai'] ?? []
      return { id, bullets: bullets.slice(0, 5) }
    })

    const projectEntries = d.projects.map(id => {
      const proj = master.projects.find(p => p.id === id)
      if (!proj) throw new Error(`Unknown project id: ${id}`)
      return { id, bullets: proj.bullets.slice(0, 3) }
    })

    const skillRows = d.skillsRows

    const serialize = (v: unknown) => JSON.stringify(v, null, 4)

    return `// Generated by ResumeAnalyze — ${new Date().toISOString()}
  const { makeDoc, TL } = require('./buildv2.js');
  const { Packer } = require('docx');
  const fs = require('fs');
  const path = require('path');

  const doc = makeDoc({
    tagline: TL(${JSON.stringify(d.tagline)}),
    work: ${serialize(workEntries)},
    projects: ${serialize(projectEntries)},
    skills: ${serialize(skillRows)},
  });

  Packer.toBuffer(doc).then(buf => {
    const out = path.join(__dirname, ${JSON.stringify(docxName)});
    fs.writeFileSync(out, buf);
    console.log('\\u2713 Written:', out);
  });
  `
  }

  function spawnAsync(cmd: string, args: string[], cwd: string): Promise<{ code: number; stdout: string; stderr: string }> {
    return new Promise(resolve => {
      const out: string[] = [], err: string[] = []
      const proc = spawn(cmd, args, { cwd })
      proc.stdout.on('data', (d: Buffer) => out.push(d.toString()))
      proc.stderr.on('data', (d: Buffer) => err.push(d.toString()))
      proc.on('close', code => resolve({ code: code ?? 1, stdout: out.join(''), stderr: err.join('') }))
    })
  }

  function tagJdFile(filePath: string): void {
    if (!filePath || !fs.existsSync(filePath)) return
    const content = fs.readFileSync(filePath, 'utf8')
    const updated = content.replace(/\bun-resume\b/g, 'resume-ed')
    fs.writeFileSync(filePath, updated, 'utf8')
  }

  function toSlug(s: string): string {
    return s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 60)
  }

  function errEvent(stage: SSEEvent['stage'], message: string): SSEEvent {
    return { stage, status: 'fail', data: { message } }
  }
  ```

- [ ] **Typecheck**
  ```bash
  npx tsc --noEmit 2>&1
  ```
  Expected: no errors. If `minItems`/`maxItems` on Anthropic tool schema cause type errors, remove those fields — they're hints only and Anthropic's SDK types don't enforce them.

- [ ] **Commit**
  ```bash
  git add lib/generate-pipeline.ts
  git commit -m "feat: add 6-stage resume generation pipeline"
  ```

---

## Task 5: POST /api/generate

**Files:**
- Create: `app/api/generate/route.ts`

- [ ] **Implement route**

  ```typescript
  import { NextResponse } from 'next/server'
  import { getDb } from '@/lib/db'

  export async function POST(req: Request) {
    const { jobIds }: { jobIds: string[] } = await req.json()
    if (!Array.isArray(jobIds) || jobIds.length === 0) {
      return NextResponse.json({ error: 'jobIds must be non-empty array' }, { status: 400 })
    }

    const db = getDb()
    const unknown = jobIds.filter(id => !db.prepare('SELECT 1 FROM jd_jobs WHERE id = ?').get(id))
    if (unknown.length > 0) {
      return NextResponse.json({ error: `Unknown job IDs: ${unknown.join(', ')}` }, { status: 400 })
    }

    return NextResponse.json({ ok: true, queued: jobIds })
  }
  ```

- [ ] **Typecheck**
  ```bash
  npx tsc --noEmit 2>&1
  ```

- [ ] **Commit**
  ```bash
  git add app/api/generate/route.ts
  git commit -m "feat: add POST /api/generate endpoint"
  ```

---

## Task 6: GET /api/generate/[jobId]/stream

**Files:**
- Create: `app/api/generate/[jobId]/stream/route.ts`

- [ ] **Create directory**
  ```bash
  mkdir -p "app/api/generate/[jobId]/stream"
  ```

- [ ] **Implement SSE route**

  ```typescript
  import { runPipeline } from '@/lib/generate-pipeline'

  export const dynamic = 'force-dynamic'

  export async function GET(
    _req: Request,
    { params }: { params: Promise<{ jobId: string }> }
  ) {
    const { jobId } = await params

    const stream = new ReadableStream({
      async start(controller) {
        const encode = (event: object) =>
          new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`)
        try {
          for await (const event of runPipeline(jobId)) {
            controller.enqueue(encode(event))
          }
        } catch (err) {
          controller.enqueue(encode({
            stage: 'error', status: 'fail', data: { message: String(err) }
          }))
        } finally {
          controller.close()
        }
      },
    })

    return new Response(stream, {
      headers: {
        'Content-Type':  'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection':    'keep-alive',
      },
    })
  }
  ```

- [ ] **Typecheck**
  ```bash
  npx tsc --noEmit 2>&1
  ```

- [ ] **Commit**
  ```bash
  git add "app/api/generate/[jobId]/stream/route.ts"
  git commit -m "feat: add SSE stream endpoint for resume generation"
  ```

---

## Task 7: GET /api/generate/[jobId]/download

**Files:**
- Create: `app/api/generate/[jobId]/download/route.ts`

- [ ] **Create directory and implement**

  ```bash
  mkdir -p "app/api/generate/[jobId]/download"
  ```

  ```typescript
  import { NextResponse } from 'next/server'
  import { getDb } from '@/lib/db'
  import fs from 'fs'
  import path from 'path'

  export async function GET(
    _req: Request,
    { params }: { params: Promise<{ jobId: string }> }
  ) {
    const { jobId } = await params

    const output = getDb().prepare(
      'SELECT docx_path FROM jd_outputs WHERE job_id = ? ORDER BY built_at DESC LIMIT 1'
    ).get(jobId) as { docx_path: string } | undefined

    if (!output?.docx_path) {
      return NextResponse.json({ error: 'No output found for this job' }, { status: 404 })
    }
    if (!fs.existsSync(output.docx_path)) {
      return NextResponse.json({ error: 'DOCX file not found on disk' }, { status: 404 })
    }

    const buf      = fs.readFileSync(output.docx_path)
    const filename = path.basename(output.docx_path)

    return new Response(buf, {
      headers: {
        'Content-Type':        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  }
  ```

- [ ] **Typecheck + commit**
  ```bash
  npx tsc --noEmit 2>&1 && git add "app/api/generate/[jobId]/download/route.ts" && git commit -m "feat: add DOCX download endpoint"
  ```

---

## Task 8: POST /api/generate/feedback

**Files:**
- Create: `app/api/generate/feedback/route.ts`

- [ ] **Implement**

  ```typescript
  import { NextResponse } from 'next/server'
  import { getDb } from '@/lib/db'
  import fs from 'fs'
  import path from 'path'

  interface FeedbackBody {
    jobId: string
    outputId: string
    rating: 1 | 2 | 3
    note: string
  }

  export async function POST(req: Request) {
    const { jobId, outputId, rating, note }: FeedbackBody = await req.json()

    if (!jobId || ![1,2,3].includes(rating)) {
      return NextResponse.json({ error: 'jobId and rating (1-3) required' }, { status: 400 })
    }

    const job = getDb().prepare(
      'SELECT company, role_title FROM jd_jobs WHERE id = ?'
    ).get(jobId) as { company: string; role_title: string } | undefined

    const label = job ? `${job.company}_${job.role_title}` : jobId
    const date  = new Date().toISOString().slice(0, 10)
    const text  = note?.trim() || '(no note)'

    const entry = `\n## ${date} ${label} rate:${rating}/3\n**What went wrong**: ${text}\n**Fix applied**: (pending)\n**Root cause**: (pending)\n**Should have done**: (pending)\n`

    const logPath = path.join(process.cwd(), 'feedback', 'raw-log.md')
    fs.appendFileSync(logPath, entry, 'utf8')

    return NextResponse.json({ ok: true })
  }
  ```

- [ ] **Typecheck + commit**
  ```bash
  npx tsc --noEmit 2>&1 && git add app/api/generate/feedback/route.ts && git commit -m "feat: add feedback endpoint"
  ```

---

## Task 9: Jobs Table — Checkboxes, Generate Button, Status Column

**Files:**
- Modify: `app/jobs/page.tsx`

- [ ] **Add checkbox state and generate trigger to JobsPage**

  Add these state variables after existing state declarations (around line 74 — alongside `selectedJobId`):
  ```typescript
  const [selected, setSelected]         = useState<Set<string>>(new Set())
  const [genStatus, setGenStatus]       = useState<Map<string, string>>(new Map())
  const [generating, setGenerating]     = useState(false)
  const [showPanel, setShowPanel]       = useState(false)
  const [generateQueue, setGenerateQueue] = useState<string[]>([])
  ```

  Add `toggleSelect`, `toggleAll`, and `generate` handlers after `onSort`:
  ```typescript
  const toggleSelect = (id: string) =>
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  const allVisibleSelected = visible.length > 0 && visible.every(j => selected.has(j.id))

  const toggleAll = () =>
    setSelected(allVisibleSelected ? new Set() : new Set(visible.map(j => j.id)))

  const generate = async () => {
    const ids = Array.from(selected)
    if (ids.length === 0) return
    setGenerating(true)
    const res = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobIds: ids }),
    })
    if (!res.ok) { setGenerating(false); return }
    setGenerateQueue(ids)
    setShowPanel(true)
  }
  ```

- [ ] **Update table header to include checkbox column and Generate button**

  Replace the existing header row `<tr>`:
  ```tsx
  <tr className="border-b border-zinc-700">
    <th className="pb-2 pr-3 w-6">
      <input
        type="checkbox"
        checked={allVisibleSelected}
        onChange={toggleAll}
        className="accent-indigo-500"
      />
    </th>
    <SortTh label="Company"  col="company"    sort={sort} onSort={onSort} />
    <SortTh label="Role"     col="role_title" sort={sort} onSort={onSort} />
    <SortTh label="Track"    col="role_track" sort={sort} onSort={onSort} />
    <SortTh label="Fit%"     col="fit_pct"    sort={sort} onSort={onSort} className="w-16" />
    <SortTh label="Action"   col="action"     sort={sort} onSort={onSort} className="w-40" />
    <SortTh label="Clipped"  col="file_mtime" sort={sort} onSort={onSort} className="w-28" />
    <SortTh label="Scanned"  col="scanned_at" sort={sort} onSort={onSort} className="w-28" />
    <th className="pb-2 w-16 text-left text-zinc-500">Visa</th>
    <th className="pb-2 w-24 text-left text-zinc-500">Status</th>
  </tr>
  ```

- [ ] **Update header bar to include Generate button**

  In the header `<div className="flex items-center gap-3">`, add after the Scan button:
  ```tsx
  <button
    onClick={generate}
    disabled={selected.size === 0 || generating}
    className="text-sm px-3 py-1 bg-indigo-600 hover:bg-indigo-500 rounded disabled:opacity-40"
  >
    {generating ? 'Generating…' : `Generate ${selected.size > 0 ? selected.size : ''} selected`}
  </button>
  ```

- [ ] **Update each table row to add checkbox and status cells**

  In the `visible.map(job => ...)` return, add as first `<td>`:
  ```tsx
  <td className="py-2 pr-3">
    <input
      type="checkbox"
      checked={selected.has(job.id)}
      onChange={() => toggleSelect(job.id)}
      onClick={e => e.stopPropagation()}
      className="accent-indigo-500"
    />
  </td>
  ```

  And as last `<td>` (after visa):
  ```tsx
  <td className="py-2 text-xs">
    {genStatus.get(job.id)
      ? <span className={genStatus.get(job.id) === 'done' ? 'text-green-400' : genStatus.get(job.id)?.startsWith('✗') ? 'text-red-400' : 'text-zinc-400'}>
          {genStatus.get(job.id)}
        </span>
      : <span className="text-zinc-600">—</span>
    }
  </td>
  ```

- [ ] **Render GenerationPanel below filter bar (add after filter bar, before table)**

  Import at top:
  ```typescript
  import GenerationPanel from '@/components/GenerationPanel'
  ```

  Add before the table JSX:
  ```tsx
  {showPanel && generateQueue.length > 0 && (
    <GenerationPanel
      queue={generateQueue}
      onStageUpdate={(jobId, stage) =>
        setGenStatus(prev => new Map(prev).set(jobId, `⟳ ${stage}`))
      }
      onDone={(jobId) => {
        setGenStatus(prev => new Map(prev).set(jobId, 'done'))
        setGenerating(false)
        reload(q)
      }}
      onError={(jobId, msg) => {
        setGenStatus(prev => new Map(prev).set(jobId, `✗ ${msg.slice(0, 20)}`))
        setGenerating(false)
      }}
    />
  )}
  ```

- [ ] **Typecheck**
  ```bash
  npx tsc --noEmit 2>&1
  ```

- [ ] **Commit**
  ```bash
  git add app/jobs/page.tsx
  git commit -m "feat: add checkbox selection and generate button to jobs table"
  ```

---

## Task 10: components/GenerationPanel.tsx

**Files:**
- Create: `components/GenerationPanel.tsx`

SSE consumer. Opens streams sequentially. Shows per-job stage progress, download link, and rating UI.

- [ ] **Implement GenerationPanel**

  ```typescript
  'use client'
  import { useEffect, useRef, useState } from 'react'

  interface SSEEvent {
    stage: string
    status: 'ok' | 'fail' | 'running'
    data: Record<string, unknown>
  }

  interface JobProgress {
    stages: SSEEvent[]
    outputId: string | null
    docPath: string | null
    done: boolean
    failed: boolean
  }

  interface Props {
    queue: string[]
    onStageUpdate: (jobId: string, stage: string) => void
    onDone: (jobId: string) => void
    onError: (jobId: string, msg: string) => void
  }

  export default function GenerationPanel({ queue, onStageUpdate, onDone, onError }: Props) {
    const [progress, setProgress] = useState<Map<string, JobProgress>>(new Map())
    const [ratings, setRatings]   = useState<Map<string, { rating: number; note: string; submitted: boolean }>>(new Map())
    const running = useRef(false)

    useEffect(() => {
      if (running.current) return
      running.current = true
      runQueue(queue)
    }, [])

    async function runQueue(ids: string[]) {
      for (const jobId of ids) {
        await runJob(jobId)
      }
    }

    function updateProgress(jobId: string, update: Partial<JobProgress>) {
      setProgress(prev => {
        const cur = prev.get(jobId) ?? { stages: [], outputId: null, docPath: null, done: false, failed: false }
        return new Map(prev).set(jobId, { ...cur, ...update })
      })
    }

    async function runJob(jobId: string) {
      const evtSource = new EventSource(`/api/generate/${jobId}/stream`)

      await new Promise<void>(resolve => {
        evtSource.onmessage = (e) => {
          const event: SSEEvent = JSON.parse(e.data)

          setProgress(prev => {
            const cur = prev.get(jobId) ?? { stages: [], outputId: null, docPath: null, done: false, failed: false }
            const stages = [...cur.stages.filter(s => s.stage !== event.stage || s.status === 'ok'), event]
            return new Map(prev).set(jobId, { ...cur, stages })
          })

          if (event.status === 'running') onStageUpdate(jobId, event.stage)

          if (event.stage === 'finalize' && event.status === 'ok') {
            updateProgress(jobId, { docPath: event.data.path as string })
          }
          if (event.stage === 'done') {
            updateProgress(jobId, { done: true, outputId: event.data.outputId as string })
            onDone(jobId)
            evtSource.close()
            resolve()
          }
          if (event.status === 'fail') {
            updateProgress(jobId, { failed: true })
            onError(jobId, event.data.message as string ?? event.stage)
            evtSource.close()
            resolve()
          }
        }
        evtSource.onerror = () => { evtSource.close(); resolve() }
      })
    }

    const submitRating = async (jobId: string) => {
      const r = ratings.get(jobId)
      if (!r) return
      const outputId = progress.get(jobId)?.outputId ?? ''
      await fetch('/api/generate/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId, outputId, rating: r.rating, note: r.note }),
      })
      setRatings(prev => new Map(prev).set(jobId, { ...r, submitted: true }))
    }

    return (
      <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-4 space-y-4">
        <h3 className="text-sm font-semibold text-zinc-300">Generating Resumes</h3>
        {queue.map(jobId => {
          const jp = progress.get(jobId)
          const r  = ratings.get(jobId) ?? { rating: 0, note: '', submitted: false }
          return (
            <div key={jobId} className="border-t border-zinc-800 pt-3 space-y-1">
              <p className="text-xs font-mono text-zinc-400">{jobId}</p>
              {jp?.stages.map(ev => (
                <div key={ev.stage} className="flex gap-2 text-xs">
                  <span className={ev.status === 'ok' ? 'text-green-400' : ev.status === 'fail' ? 'text-red-400' : 'text-zinc-500'}>
                    {ev.status === 'ok' ? '✓' : ev.status === 'fail' ? '✗' : '⟳'}
                  </span>
                  <span className="text-zinc-400 w-24">{ev.stage}</span>
                  <span className="text-zinc-500 truncate max-w-xs">
                    {ev.status === 'ok' && ev.data.tagline ? `tagline: "${ev.data.tagline}"` : ''}
                    {ev.data.violations ? (ev.data.violations as string[]).join(', ') : ''}
                    {ev.data.fixed ? (ev.data.fixed as string[]).join(', ') : ''}
                    {ev.data.message ? String(ev.data.message) : ''}
                  </span>
                </div>
              ))}

              {jp?.docPath && (
                <a
                  href={`/api/generate/${jobId}/download`}
                  className="inline-block mt-1 text-xs text-indigo-400 hover:text-indigo-300"
                  download
                >
                  ↓ Download DOCX
                </a>
              )}

              {jp?.done && !r.submitted && (
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-xs text-zinc-500">Rate:</span>
                  {[1,2,3].map(n => (
                    <button
                      key={n}
                      onClick={() => setRatings(prev => new Map(prev).set(jobId, { ...r, rating: n }))}
                      className={`text-xs px-2 py-0.5 rounded border ${r.rating === n ? 'border-indigo-500 text-indigo-400' : 'border-zinc-700 text-zinc-500'}`}
                    >
                      {n}
                    </button>
                  ))}
                  <input
                    value={r.note}
                    onChange={e => setRatings(prev => new Map(prev).set(jobId, { ...r, note: e.target.value }))}
                    placeholder="note…"
                    className="flex-1 text-xs bg-zinc-800 border border-zinc-700 rounded px-2 py-0.5 text-zinc-300"
                  />
                  <button
                    onClick={() => submitRating(jobId)}
                    disabled={r.rating === 0}
                    className="text-xs px-2 py-0.5 bg-indigo-600 hover:bg-indigo-500 rounded disabled:opacity-40"
                  >
                    Submit
                  </button>
                </div>
              )}
              {r.submitted && <p className="text-xs text-green-400 mt-1">Feedback saved ✓</p>}
            </div>
          )
        })}
      </div>
    )
  }
  ```

- [ ] **Typecheck**
  ```bash
  npx tsc --noEmit 2>&1
  ```

- [ ] **Commit**
  ```bash
  git add components/GenerationPanel.tsx
  git commit -m "feat: add GenerationPanel SSE consumer with rating UI"
  ```

---

## Task 11: Config Page — Reference Docs Section

**Files:**
- Modify: `app/api/config/read/route.ts`
- Modify: `app/api/config/write/route.ts`
- Modify: `app/config/page.tsx`

- [ ] **Extend read route ALLOWED map**

  In `app/api/config/read/route.ts`, replace the `ALLOWED` declaration:
  ```typescript
  import { PATHS } from '@/lib/paths'

  const ALLOWED: Record<string, string> = {
    'buildv2.js':                        PATHS.pipeline.builder,
    'master_resume_data.json':            PATHS.pipeline.masterData,
    'ats-optimized-resume-system.md':     PATHS.docs.atsSystem,
    'ats-optimization-guidelines.md':     PATHS.docs.atsGuidelines,
    'CLAUDE-full.md':                     PATHS.docs.claudeFull,
    'spec-job-match-resume-generator.md': PATHS.docs.spec,
  }
  ```

- [ ] **Extend write route ALLOWED map**

  In `app/api/config/write/route.ts`, same ALLOWED map change.

  Also update the validation block — `.md` files skip syntax checks entirely:
  ```typescript
  // Only validate .json and .js — skip .md
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
  ```
  (This is the existing logic — just confirm `.md` falls through without validation.)

- [ ] **Add Reference Docs section to config page**

  In `app/config/page.tsx`, after the `ConfigEditor` type definition, add the doc file keys to the type:
  ```typescript
  type FileKey =
    | 'buildv2.js'
    | 'master_resume_data.json'
    | 'ats-optimized-resume-system.md'
    | 'ats-optimization-guidelines.md'
    | 'CLAUDE-full.md'
    | 'spec-job-match-resume-generator.md'
  ```

  In `ConfigPage`, add a new section after the existing editors:
  ```tsx
  <div>
    <h2 className="text-sm font-semibold text-zinc-400 mb-4">Reference Docs</h2>
    <p className="text-xs text-zinc-600 mb-4">
      These files are injected into every AI reasoning call. Edit to tune resume generation behavior.
    </p>
    <div className="space-y-8">
      <ConfigEditor file="ats-optimization-guidelines.md" />
      <ConfigEditor file="CLAUDE-full.md" />
      <ConfigEditor file="ats-optimized-resume-system.md" />
      <ConfigEditor file="spec-job-match-resume-generator.md" />
    </div>
  </div>
  ```

- [ ] **Typecheck**
  ```bash
  npx tsc --noEmit 2>&1
  ```

- [ ] **Commit**
  ```bash
  git add app/api/config/read/route.ts app/api/config/write/route.ts app/config/page.tsx
  git commit -m "feat: add reference docs editors to config page"
  ```

---

## Final Verification

- [ ] **Full typecheck**
  ```bash
  npx tsc --noEmit 2>&1
  ```
  Expected: no output.

- [ ] **Run all tests**
  ```bash
  npx vitest run 2>&1 | tail -20
  ```
  Expected: all passing.

- [ ] **Start dev server and verify UI**
  ```bash
  npm run dev
  ```
  - Navigate to `/jobs` — confirm checkbox column and "Generate N selected" button appear
  - Navigate to `/config` — confirm Reference Docs section with 4 editors appears
  - Select one job, click Generate — confirm GenerationPanel appears (will error on AI call if no API key, but panel should render)

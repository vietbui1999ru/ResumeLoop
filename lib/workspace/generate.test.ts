import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { resolveJobSelector, generateOne } from './generate'
import type { IndexedJob } from './index-db'
import type { SpineDecision } from '../providers/spine'

const masterDataJson = fs.readFileSync(
  path.join(process.cwd(), 'pipeline', 'master_resume_data.json'),
  'utf8',
)
const masterIds = JSON.parse(masterDataJson) as {
  experience: { id: string }[]
  projects: { id: string }[]
}

function job(overrides: Partial<IndexedJob>): IndexedJob {
  return {
    id: 'acme-backend-engineer',
    file_path: '/tmp/does-not-matter.md',
    company: 'Acme',
    role_title: 'Backend Engineer',
    tags: '[]',
    visa_status: 'unknown',
    action: null,
    clipped_at: null,
    apply_url: null,
    hidden: 0,
    ...overrides,
  }
}

describe('resolveJobSelector', () => {
  const jobs = [
    job({ id: 'acme-backend-engineer', company: 'Acme', role_title: 'Backend Engineer' }),
    job({ id: 'globex-ai-engineer', company: 'Globex', role_title: 'AI Engineer' }),
    job({ id: 'acme-frontend-engineer', company: 'Acme', role_title: 'Frontend Engineer' }),
  ]

  it('matches an exact id', () => {
    const r = resolveJobSelector(jobs, 'globex-ai-engineer')
    expect(r.kind).toBe('found')
    if (r.kind === 'found') expect(r.job.company).toBe('Globex')
  })

  it('matches a unique case-insensitive partial against company/role', () => {
    const r = resolveJobSelector(jobs, 'globex')
    expect(r.kind).toBe('found')
    if (r.kind === 'found') expect(r.job.id).toBe('globex-ai-engineer')
  })

  it('reports ambiguous when multiple jobs match', () => {
    const r = resolveJobSelector(jobs, 'acme')
    expect(r.kind).toBe('ambiguous')
    if (r.kind === 'ambiguous') expect(r.candidates).toHaveLength(2)
  })

  it('reports none when nothing matches', () => {
    const r = resolveJobSelector(jobs, 'nonexistent-co')
    expect(r.kind).toBe('none')
  })
})

describe('generateOne', () => {
  let root: string
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'rl-gen-'))
    process.env.RESUMELOOP_HOME = root
    fs.mkdirSync(path.join(root, 'data'), { recursive: true })
    fs.writeFileSync(path.join(root, 'data', 'profile.json'), masterDataJson)
  })
  afterEach(() => {
    delete process.env.RESUMELOOP_HOME
    fs.rmSync(root, { recursive: true, force: true })
  })

  const fixtureDecision: SpineDecision = {
    fitPct: 84,
    fitNote: 'Strong overlap on backend + AI tooling.',
    track: 'GenAI / AI Engineer',
    workVariant: 'genai',
    workIds: masterIds.experience.slice(0, 3).map(e => e.id),
    projects: masterIds.projects.slice(0, 3).map(p => p.id),
    tagline: 'AI engineer building local-first developer tools',
    skillsRows: ['Languages: Python · TypeScript · Go', 'AI: LLMs · RAG · Zod'],
  }

  it('writes a .docx and an evaluation record from a fake runner', async () => {
    const jdPath = path.join(root, 'jd.md')
    fs.writeFileSync(jdPath, '---\ntitle: Backend Engineer | Acme\n---\nWe are hiring a backend engineer.')
    const runner = vi.fn().mockResolvedValue('```json\n' + JSON.stringify(fixtureDecision) + '\n```')

    const result = await generateOne(root, job({ file_path: jdPath }), runner)

    expect(fs.existsSync(result.docxPath)).toBe(true)
    expect(fs.statSync(result.docxPath).size).toBeGreaterThan(1000)
    expect(fs.existsSync(result.evaluationPath)).toBe(true)
    expect(fs.readFileSync(result.evaluationPath, 'utf8')).toContain('Acme')
    // PDF rendering (Playwright) is non-fatal — either it produced a real file, or
    // pdfError explains why not. Both are valid outcomes in a sandboxed test env.
    if (result.pdfPath) expect(fs.existsSync(result.pdfPath)).toBe(true)
    else expect(result.pdfError).toBeTruthy()
  })

  it('throws a clear error when profile.json is missing', async () => {
    fs.rmSync(path.join(root, 'data', 'profile.json'))
    const jdPath = path.join(root, 'jd.md')
    fs.writeFileSync(jdPath, '---\ntitle: Backend Engineer | Acme\n---\nJD body.')
    const runner = vi.fn()
    await expect(generateOne(root, job({ file_path: jdPath }), runner)).rejects.toThrow(/No profile\.json found/)
    expect(runner).not.toHaveBeenCalled()
  })
})

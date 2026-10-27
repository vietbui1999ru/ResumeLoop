import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { writeEvaluation } from './evaluations'
import type { IndexedJob } from './index-db'
import type { SpineDecision } from '../providers/spine'

let root: string
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'rl-eval-'))
})
afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true })
})

const fixtureJob: IndexedJob = {
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
}

const fixtureDecision: SpineDecision = {
  fitPct: 84,
  fitNote: 'Strong overlap on backend + AI tooling.',
  track: 'GenAI / AI Engineer',
  workVariant: 'genai',
  workIds: ['job1', 'job2', 'job3'],
  projects: ['claude_tui', 'resumeloop', 'llm_wiki'],
  tagline: 'AI engineer building local-first developer tools',
  skillsRows: ['Languages: Python · TypeScript · Go'],
}

describe('writeEvaluation', () => {
  it('writes a markdown record with fit, track, and selection details', () => {
    const file = writeEvaluation(root, fixtureJob, fixtureDecision)
    expect(fs.existsSync(file)).toBe(true)
    expect(path.basename(file)).toBe('acme-backend-engineer.md')

    const body = fs.readFileSync(file, 'utf8')
    expect(body).toContain('# Acme — Backend Engineer')
    expect(body).toContain('Fit: 84% — Strong overlap on backend + AI tooling.')
    expect(body).toContain('Track: GenAI / AI Engineer')
    expect(body).toContain('Variant: genai')
    expect(body).toContain('Work IDs: job1, job2, job3')
    expect(body).toContain('Projects: claude_tui, resumeloop, llm_wiki')
    expect(body).toContain('Tagline: AI engineer building local-first developer tools')
  })

  it('creates data/evaluations/ if it does not exist yet', () => {
    expect(fs.existsSync(path.join(root, 'data', 'evaluations'))).toBe(false)
    writeEvaluation(root, fixtureJob, fixtureDecision)
    expect(fs.existsSync(path.join(root, 'data', 'evaluations'))).toBe(true)
  })
})

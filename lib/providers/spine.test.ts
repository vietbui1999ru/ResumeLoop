import { describe, it, expect, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { decideForJob, renderDocxBuffer, renderResumePdf, assembleResumeData, SpineDecisionSchema, type SpineDecision } from './spine'
import { claudeRunner } from './claude'

const masterDataJson = fs.readFileSync(
  path.join(process.cwd(), 'pipeline', 'master_resume_data.json'),
  'utf8',
)
const masterIds = JSON.parse(masterDataJson) as {
  experience: { id: string }[]
  projects: { id: string }[]
}

// A valid decision built from REAL ids in the bootstrap master data.
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

describe('decideForJob', () => {
  it('embeds the master valid IDs in the prompt and returns a validated decision', async () => {
    const runner = vi.fn().mockResolvedValue('```json\n' + JSON.stringify(fixtureDecision) + '\n```')
    const decision = await decideForJob('Senior AI Engineer at a seed startup.', masterDataJson, runner)
    expect(SpineDecisionSchema.safeParse(decision).success).toBe(true)
    const sentPrompt = String(runner.mock.calls[0][0])
    expect(sentPrompt).toContain(masterIds.experience[0].id)
    expect(sentPrompt).toContain('<job_description>')
  })
})

describe('assembleResumeData', () => {
  it('maps a decision into the shared ResumeData shape with trimmed bullets', () => {
    const data = assembleResumeData(fixtureDecision, masterDataJson)
    expect(data.work.length).toBe(3)
    expect(data.projects.length).toBe(3)
    expect(data.skills.length).toBe(2)
    expect(data.tagline).toBe(fixtureDecision.tagline)
    for (const w of data.work) for (const b of w.bullets) expect(b.length).toBeLessThanOrEqual(116)
  })
})

describe('renderDocxBuffer', () => {
  it('renders a non-empty ATS .docx Buffer from a decision (no LibreOffice)', async () => {
    const buf = await renderDocxBuffer(fixtureDecision, masterDataJson)
    expect(Buffer.isBuffer(buf)).toBe(true)
    expect(buf.length).toBeGreaterThan(1000) // a real .docx zip is several KB
    // DOCX files are zip archives — first two bytes are "PK".
    expect(buf.subarray(0, 2).toString('latin1')).toBe('PK')
  })
})

// Full spine, real CLI: opt in with RESUMELOOP_E2E_CLAUDE=1.
const runE2E = process.env.RESUMELOOP_E2E_CLAUDE === '1'
describe.runIf(runE2E)('spine end-to-end (live claude)', () => {
  it('JD -> claude -> decision -> .docx file on disk', async () => {
    const jd = 'We are hiring a GenAI Engineer to build LLM-powered developer tools. ' +
      'Python, TypeScript, and agent orchestration experience required. Seed-stage startup.'
    const decision = await decideForJob(jd, masterDataJson, claudeRunner())
    expect(decision.fitPct).toBeGreaterThanOrEqual(0)
    expect(decision.fitPct).toBeLessThanOrEqual(100)
    expect(decision.workIds.length).toBeGreaterThanOrEqual(1)

    const outDir = path.join(process.cwd(), 'test-results')
    fs.mkdirSync(outDir, { recursive: true })

    const docx = await renderDocxBuffer(decision, masterDataJson)
    fs.writeFileSync(path.join(outDir, 'spine-demo.docx'), docx)
    expect(docx.subarray(0, 2).toString('latin1')).toBe('PK')

    // Both outputs from one decision (ADR §5): pretty PDF via Playwright, no LibreOffice.
    const pdf = await renderResumePdf(decision, masterDataJson)
    fs.writeFileSync(path.join(outDir, 'spine-demo.pdf'), pdf)
    expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-')

    console.info(`[spine] fit=${decision.fitPct}% track="${decision.track}" -> .docx (${(docx.length / 1024).toFixed(1)}KB) + .pdf (${(pdf.length / 1024).toFixed(1)}KB)`)
  }, 180_000)
})

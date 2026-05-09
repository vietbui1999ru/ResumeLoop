import fs from 'fs'
import path from 'path'
import { spawn } from 'child_process'
import { randomUUID } from 'crypto'
import { reasonForJob, type ReasoningResult } from './ai-reason'
import { getDb } from './db'
import { getSetting } from './settings'
import { PATHS } from './paths'
import { GenerationLogger } from './generation-logger'

export interface SSEEvent {
  stage: 'preflight' | 'ai-reason' | 'write-script' | 'build' | 'validate' | 'fix-loop' | 'pdf' | 'finalize' | 'done' | 'error'
  status: 'ok' | 'fail' | 'running'
  data: Record<string, unknown>
}

const BATCH_BUILD = path.join(process.cwd(), 'harness', 'batch-build')
const VALIDATE_JS = path.join(process.cwd(), 'harness', 'validate.js')

// Map workVariant → bullets variant key (experience.bullets keys: systems/genai/fullstack/sre)
function bulletsKey(workVariant: string): string {
  if (workVariant === 'IT-track') return 'sre'
  return workVariant
}


export async function* runPipeline(jobId: string): AsyncGenerator<SSEEvent> {
  const job = getDb().prepare(
    'SELECT id, company, role_title, file_path, raw_content FROM jd_jobs WHERE id = ?'
  ).get(jobId) as { id: string; company: string; role_title: string; file_path: string; raw_content: string } | undefined

  if (!job) { yield errEvent('preflight', `Job not found: ${jobId}`); return }

  const logger = new GenerationLogger(jobId, job.company, job.role_title)

  function emit(event: SSEEvent): SSEEvent {
    logger.stage({ stage: event.stage, status: event.status, data: event.data })
    return event
  }

  // Stage 0: Preflight
  yield emit({ stage: 'preflight', status: 'running', data: {} })
  try {
    await preflight()
  } catch (e) {
    yield emit(errEvent('preflight', String(e))); logger.finish('failed'); return
  }
  yield emit({ stage: 'preflight', status: 'ok', data: {} })

  // Stage 1: AI reasoning
  yield emit({ stage: 'ai-reason', status: 'running', data: {} })
  let decision: ReasoningResult
  try {
    decision = await reasonForJob(job.raw_content)
  } catch (e) {
    yield emit(errEvent('ai-reason', String(e))); logger.finish('failed'); return
  }
  logger.setAIDecision(decision as unknown as Record<string, unknown>)
  yield emit({ stage: 'ai-reason', status: 'ok', data: decision as unknown as Record<string, unknown> })

  // Stage 2: Write build script
  yield emit({ stage: 'write-script', status: 'running', data: {} })
  const slug = toSlug(`${job.company}_${job.role_title}`)
  const scriptName = `${slug}.js`
  const scriptPath = path.join(BATCH_BUILD, scriptName)
  const docxName   = `${slug}_VietBui.docx`

  try {
    const script = buildScript(decision, slug, docxName)
    fs.writeFileSync(scriptPath, script, 'utf8')
    logger.setScript(scriptPath, script)
  } catch (e) {
    yield emit(errEvent('write-script', String(e))); logger.finish('failed'); return
  }
  yield emit({ stage: 'write-script', status: 'ok', data: { script: scriptName } })

  // Stages 3+4+5: Build → Validate → Fix loop
  let docxPath: string | null = null
  for await (const event of buildValidateLoop(scriptPath, docxName)) {
    yield emit(event)
    if (event.stage === 'finalize' && event.status === 'ok') {
      docxPath = event.data.docx as string
    }
    if (event.status === 'fail') { logger.finish('failed'); return }
  }

  if (!docxPath) { yield emit(errEvent('finalize', 'DOCX path not set after pipeline')); logger.finish('failed'); return }

  // Stage: PDF generation (non-fatal)
  yield emit({ stage: 'pdf', status: 'running', data: {} })
  let pdfPath: string | null = null
  const base = docxName.endsWith('.docx') ? docxName.slice(0, -5) : docxName
  const pdfName = `${base}.pdf`
  const pdfExpected = path.join(BATCH_BUILD, pdfName)
  const toPdfScript = path.join(process.cwd(), 'harness', 'to-pdf.js')
  try {
    const pdfResult = await spawnAsync('node', [toPdfScript, docxPath, pdfExpected], process.cwd())
    if (pdfResult.code === 0) {
      pdfPath = pdfExpected
      yield emit({ stage: 'pdf', status: 'ok', data: { pdf: pdfPath } })
    } else {
      logger.stage({ stage: 'pdf', status: 'fail', data: { message: pdfResult.stderr } })
      yield emit({ stage: 'pdf', status: 'fail', data: { message: 'PDF generation failed (non-fatal)' } })
    }
  } catch (e) {
    yield emit({ stage: 'pdf', status: 'fail', data: { message: String(e) } })
  }

  // Stage 6: DB + tag JD
  yield emit({ stage: 'finalize', status: 'running', data: {} })
  try {
    const outputId = randomUUID()
    const outputDir = getSetting('output_path')
    const destPath  = path.join(outputDir, docxName)

    fs.mkdirSync(outputDir, { recursive: true })
    fs.renameSync(docxPath, destPath)

    let finalPdfPath: string | null = null
    if (pdfPath) {
      const pdfDest = path.join(outputDir, pdfName)
      try { fs.renameSync(pdfPath, pdfDest); finalPdfPath = pdfDest } catch { /* non-fatal */ }
    }

    getDb().prepare(`
      INSERT OR REPLACE INTO jd_outputs
        (id, job_id, docx_path, pdf_path, projects_used, work_ids_used, variant, tagline, reasoning, built_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).run(
      outputId, jobId, destPath, finalPdfPath,
      JSON.stringify(decision.projects),
      JSON.stringify(decision.workIds),
      decision.workVariant,
      decision.tagline,
      decision.reasoning ?? null
    )

    tagJdFile(job.file_path)
    logger.finish('success')

    yield emit({ stage: 'finalize', status: 'ok', data: { path: destPath } })
    yield emit({ stage: 'done', status: 'ok', data: { outputId } })
  } catch (e) {
    yield emit(errEvent('finalize', String(e)))
    logger.finish('failed')
  }
}

async function preflight(): Promise<void> {
  fs.mkdirSync(BATCH_BUILD, { recursive: true })
  fs.copyFileSync(PATHS.pipeline.masterData, path.join(BATCH_BUILD, 'master_resume_data.json'))
  fs.copyFileSync(PATHS.pipeline.builder,    path.join(BATCH_BUILD, 'buildv2.js'))

  const nodeModules = path.join(BATCH_BUILD, 'node_modules')
  if (!fs.existsSync(nodeModules)) {
    await spawnAsync('npm', ['install', 'docx'], BATCH_BUILD)
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
      yield { stage: 'validate', status: 'ok', data: {} }
      yield { stage: 'finalize', status: 'ok', data: { docx: docxExpected } }
      return
    }

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
    if (v.includes('FAIL bullet')) {
      return []
    }
  }

  fs.writeFileSync(scriptPath, src, 'utf8')
  return fixed
}

function buildScript(d: ReasoningResult, _slug: string, docxName: string): string {
  const master = JSON.parse(fs.readFileSync(PATHS.pipeline.masterData, 'utf8')) as {
    experience: Array<{ id: string; bullets: Record<string, string[]> }>
    projects:   Array<{ id: string; bullets: string[] }>
    skills:     Record<string, Record<string, string>>
  }

  const variantKey = bulletsKey(d.workVariant)

  const workEntries = d.workIds.map(id => {
    const exp = master.experience.find(e => e.id === id)
    if (!exp) throw new Error(`Unknown work id: ${id}`)
    const bullets = exp.bullets[variantKey] ?? exp.bullets['genai'] ?? []
    return { id, bullets: bullets.slice(0, 5) }
  })

  const projectEntries = d.projects.map(id => {
    const proj = master.projects.find(p => p.id === id)
    if (!proj) throw new Error(`Unknown project id: ${id}`)
    return { id, bullets: proj.bullets.slice(0, 3) }
  })

  const skillRows = d.skillsRows

  // validate.js requires unquoted JS object keys (not JSON) and T() wrappers on bullets
  const fmtWork = workEntries.map(w => {
    const bullets = w.bullets.map(b => `      T(${JSON.stringify(b)})`).join(',\n')
    return `    {\n      id: ${JSON.stringify(w.id)},\n      bullets: [\n${bullets},\n      ],\n    }`
  }).join(',\n')

  const fmtProj = projectEntries.map(p => {
    const bullets = p.bullets.map(b => `      T(${JSON.stringify(b)})`).join(',\n')
    return `    {\n      id: ${JSON.stringify(p.id)},\n      bullets: [\n${bullets},\n      ],\n    }`
  }).join(',\n')

  const fmtSkills = skillRows.map(s => `    ${JSON.stringify(s)}`).join(',\n')

  return `// Generated by ResumeAnalyze — ${new Date().toISOString()}
const { makeDoc, TL, T } = require('./buildv2.js');
const { Packer } = require('docx');
const fs = require('fs');
const path = require('path');

const doc = makeDoc({
  tagline: TL(${JSON.stringify(d.tagline)}),
  work: [
${fmtWork}
  ],
  projects: [
${fmtProj}
  ],
  skills: [
${fmtSkills}
  ],
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

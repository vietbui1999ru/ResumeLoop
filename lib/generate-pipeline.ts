import fs from 'fs'
import path from 'path'
import { spawn } from 'child_process'
import { randomUUID } from 'crypto'
import { reasonForJob, type ReasoningResult } from './ai-reason'
import { getAdapter } from './db-adapter'
import { getSetting } from './settings'
import { PATHS } from './paths'
import { GenerationLogger } from './generation-logger'
import { ensureDefaultSession, getSession } from './sessions'
import { saveOutput, isS3Key } from './storage'
import { isCloud } from './app-mode'

export interface SSEEvent {
  stage: 'preflight' | 'ai-reason' | 'write-script' | 'build' | 'validate' | 'fix-loop' | 'pdf' | 'finalize' | 'done' | 'error'
  status: 'ok' | 'fail' | 'running'
  data: Record<string, unknown>
}

const BATCH_BUILD_ROOT = path.join(process.cwd(), 'harness', 'batch-build')
const VALIDATE_JS = path.join(process.cwd(), 'harness', 'validate.js')

// Map workVariant → bullets variant key (experience.bullets keys: systems/genai/fullstack/sre)
function bulletsKey(workVariant: string): string {
  if (workVariant === 'IT-track') return 'sre'
  return workVariant
}


export async function* runPipeline(jobId: string, sessionId = 'default', userId = 'default', signal?: AbortSignal): AsyncGenerator<SSEEvent> {
  const db = await getAdapter()
  const job = await db.queryOne<{ id: string; company: string; role_title: string; file_path: string; raw_content: string }>(
    'SELECT id, company, role_title, file_path, raw_content FROM jd_jobs WHERE id = ? AND user_id = ?',
    [jobId, userId],
  )

  if (!job) { yield errEvent('preflight', `Job not found: ${jobId}`); return }

  await ensureDefaultSession(userId)
  const session = await getSession(sessionId, userId)
  if (!session) { yield errEvent('preflight', `Session not found: ${sessionId}`); return }

  const logger = new GenerationLogger(jobId, job.company, job.role_title)

  function emit(event: SSEEvent): SSEEvent {
    logger.stage({ stage: event.stage, status: event.status, data: event.data })
    return event
  }

  // Per-job working directory — isolates concurrent builds
  const jobBuildDir = path.join(BATCH_BUILD_ROOT, jobId)

  // Stage 0: Preflight
  if (signal?.aborted) { yield emit(errEvent('preflight', 'Aborted')); logger.finish('failed'); return }
  yield emit({ stage: 'preflight', status: 'running', data: {} })
  try {
    await preflight(session.data, jobBuildDir)
  } catch (e) {
    yield emit(errEvent('preflight', String(e))); logger.finish('failed'); return
  }
  yield emit({ stage: 'preflight', status: 'ok', data: {} })

  // Stage 1: AI reasoning
  if (signal?.aborted) { yield emit(errEvent('ai-reason', 'Aborted')); logger.finish('failed'); return }
  yield emit({ stage: 'ai-reason', status: 'running', data: {} })
  let decision: ReasoningResult
  try {
    decision = await reasonForJob(job.raw_content, session.data, userId)
  } catch (e) {
    yield emit(errEvent('ai-reason', String(e))); logger.finish('failed'); return
  }
  logger.setAIDecision(decision as unknown as Record<string, unknown>)
  yield emit({ stage: 'ai-reason', status: 'ok', data: decision as unknown as Record<string, unknown> })

  // Stage 2: Write build script
  if (signal?.aborted) { yield emit(errEvent('write-script', 'Aborted')); logger.finish('failed'); return }
  yield emit({ stage: 'write-script', status: 'running', data: {} })
  const slug = toSlug(`${job.company}_${job.role_title}`)
  const scriptName = `${slug}.js`
  const scriptPath = path.join(jobBuildDir, scriptName)
  const docxName   = `${slug}_VietBui.docx`

  // Resolve master data: active profile > session.data > disk fallback
  let masterDataJson = session.data
  const activeProfile = await db.queryOne<{ data: string }>(
    'SELECT data FROM resume_profiles WHERE user_id = ? AND is_active = 1 LIMIT 1',
    [userId],
  )
  if (activeProfile?.data) masterDataJson = activeProfile.data

  try {
    const script = buildScript(decision, slug, docxName, masterDataJson)
    fs.writeFileSync(scriptPath, script, 'utf8')
    logger.setScript(scriptPath, script)
  } catch (e) {
    yield emit(errEvent('write-script', String(e))); logger.finish('failed'); return
  }
  yield emit({ stage: 'write-script', status: 'ok', data: { script: scriptName } })

  // Stages 3+4+5: Build → Validate → Fix loop
  // The inner generator emits a finalize:ok sentinel to pass the docx path back.
  // We capture it here but do NOT forward it to the SSE stream — the outer
  // runPipeline emits its own finalize:ok after the DB write.
  let docxPath: string | null = null
  for await (const event of buildValidateLoop(scriptPath, docxName, jobBuildDir, signal)) {
    if (event.stage === 'finalize' && event.status === 'ok') {
      docxPath = event.data.docx as string
      continue // captured — do not forward to SSE stream
    }
    yield emit(event)
    if (event.status === 'fail') { logger.finish('failed'); return }
  }

  if (!docxPath) { yield emit(errEvent('finalize', 'DOCX path not set after pipeline')); logger.finish('failed'); return }

  // Stage: PDF generation (non-fatal)
  yield emit({ stage: 'pdf', status: 'running', data: {} })
  let pdfPath: string | null = null
  const base = docxName.endsWith('.docx') ? docxName.slice(0, -5) : docxName
  const pdfName = `${base}.pdf`
  const pdfExpected = path.join(jobBuildDir, pdfName)
  const toPdfScript = path.join(process.cwd(), 'harness', 'to-pdf.js')
  try {
    const pdfResult = await spawnAsync('node', [toPdfScript, docxPath, pdfExpected], process.cwd(), signal)
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

    let finalDocxPath: string
    let finalPdfPath: string | null = null

    if (isCloud()) {
      // Upload to S3 — s3Key format: outputs/<jobId>/<filename>
      finalDocxPath = await saveOutput(docxPath, `outputs/${jobId}/${docxName}`)
      if (pdfPath) {
        try {
          finalPdfPath = await saveOutput(pdfPath, `outputs/${jobId}/${pdfName}`)
        } catch { /* non-fatal */ }
      }
    } else {
      // Local: move files to output_path directory
      const outputDir = await getSetting('output_path')
      fs.mkdirSync(outputDir, { recursive: true })
      const destPath = path.join(outputDir, docxName)
      fs.renameSync(docxPath, destPath)
      finalDocxPath = destPath

      if (pdfPath) {
        const pdfDest = path.join(outputDir, pdfName)
        try { fs.renameSync(pdfPath, pdfDest); finalPdfPath = pdfDest } catch { /* non-fatal */ }
      }
    }

    await db.run(`
      INSERT INTO jd_outputs
        (id, job_id, docx_path, pdf_path, projects_used, work_ids_used, variant, tagline, reasoning, session_id, user_id, built_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(id) DO UPDATE SET
        job_id        = excluded.job_id,
        docx_path     = excluded.docx_path,
        pdf_path      = excluded.pdf_path,
        projects_used = excluded.projects_used,
        work_ids_used = excluded.work_ids_used,
        variant       = excluded.variant,
        tagline       = excluded.tagline,
        reasoning     = excluded.reasoning,
        session_id    = excluded.session_id,
        user_id       = excluded.user_id,
        built_at      = CURRENT_TIMESTAMP
    `, [
      outputId, jobId, finalDocxPath, finalPdfPath,
      JSON.stringify(decision.projects),
      JSON.stringify(decision.workIds),
      decision.workVariant,
      decision.tagline,
      decision.reasoning ?? null,
      sessionId,
      userId,
    ])

    await tagJdFile(job.file_path)
    logger.finish('success')

    // Clean up per-job build dir — files are already moved to output dir or S3
    try { fs.rmSync(jobBuildDir, { recursive: true, force: true }) } catch { /* non-fatal */ }

    const displayPath = isS3Key(finalDocxPath) ? finalDocxPath : finalDocxPath
    yield emit({ stage: 'finalize', status: 'ok', data: { path: displayPath } })
    yield emit({ stage: 'done', status: 'ok', data: { outputId } })
  } catch (e) {
    yield emit(errEvent('finalize', String(e)))
    logger.finish('failed')
  }
}

async function preflight(resumeData: string, jobBuildDir: string): Promise<void> {
  // Ensure shared root has buildv2.js and node_modules
  fs.mkdirSync(BATCH_BUILD_ROOT, { recursive: true })
  fs.copyFileSync(PATHS.pipeline.builder, path.join(BATCH_BUILD_ROOT, 'buildv2.js'))
  const nodeModules = path.join(BATCH_BUILD_ROOT, 'node_modules')
  if (!fs.existsSync(nodeModules)) {
    const installResult = await spawnAsync('npm', ['install', 'docx'], BATCH_BUILD_ROOT)
    if (installResult.code !== 0) throw new Error(`npm install failed: ${installResult.stderr}`)
  }

  // Per-job dir for script + output files
  fs.mkdirSync(jobBuildDir, { recursive: true })
  fs.writeFileSync(path.join(jobBuildDir, 'master_resume_data.json'), resumeData, 'utf8')
}

async function* buildValidateLoop(scriptPath: string, docxName: string, jobBuildDir: string, signal?: AbortSignal): AsyncGenerator<SSEEvent> {
  const docxExpected = path.join(jobBuildDir, docxName)

  for (let attempt = 0; attempt < 3; attempt++) {
    if (signal?.aborted) { yield errEvent('build', 'Aborted'); return }
    // Build
    yield { stage: 'build', status: 'running', data: { attempt } }
    const buildResult = await spawnAsync('node', [scriptPath], jobBuildDir, signal)
    if (signal?.aborted) { yield errEvent('build', 'Aborted'); return }
    if (buildResult.code !== 0) {
      yield errEvent('build', buildResult.stderr || buildResult.stdout); return
    }
    yield { stage: 'build', status: 'ok', data: { script: path.basename(scriptPath), attempt } }

    if (!fs.existsSync(docxExpected)) {
      yield errEvent('build', `Build exited 0 but DOCX not found at ${docxExpected}`)
      return
    }

    // Validate
    yield { stage: 'validate', status: 'running', data: {} }
    const validateResult = await spawnAsync('node', [VALIDATE_JS, scriptPath], process.cwd(), signal)
    if (signal?.aborted) { yield errEvent('validate', 'Aborted'); return }
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

function buildScript(d: ReasoningResult, _slug: string, docxName: string, masterDataJson: string): string {
  const master = JSON.parse(masterDataJson) as {
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
const { makeDoc, TL, T } = require('../buildv2.js');
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

function spawnAsync(cmd: string, args: string[], cwd: string, signal?: AbortSignal): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise(resolve => {
    if (signal?.aborted) {
      resolve({ code: 1, stdout: '', stderr: 'Aborted before spawn' })
      return
    }
    const out: string[] = [], errChunks: string[] = []
    const proc = spawn(cmd, args, { cwd })
    const onAbort = () => { proc.kill('SIGTERM') }
    signal?.addEventListener('abort', onAbort, { once: true })
    proc.stdout.on('data', (d: Buffer) => out.push(d.toString()))
    proc.stderr.on('data', (d: Buffer) => errChunks.push(d.toString()))
    proc.on('close', code => {
      signal?.removeEventListener('abort', onAbort)
      resolve({ code: code ?? 1, stdout: out.join(''), stderr: errChunks.join('') })
    })
    proc.on('error', e => {
      signal?.removeEventListener('abort', onAbort)
      resolve({ code: 1, stdout: out.join(''), stderr: e.message })
    })
  })
}

async function tagJdFile(filePath: string): Promise<void> {
  if (!filePath) return
  try {
    const jobsDir = fs.realpathSync(await getSetting('jobs_path'))
    const real    = fs.realpathSync(filePath)
    if (!real.startsWith(jobsDir + path.sep)) return
    const content = fs.readFileSync(real, 'utf8')
    fs.writeFileSync(real, content.replace(/\bun-resume\b/g, 'resume-ed'), 'utf8')
  } catch { /* file missing or outside jobs_path — skip silently */ }
}

function toSlug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 60)
}

function errEvent(stage: SSEEvent['stage'], message: string): SSEEvent {
  return { stage, status: 'fail', data: { message } }
}

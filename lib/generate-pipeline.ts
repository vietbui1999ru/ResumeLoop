import fs from 'fs'
import path from 'path'
import { spawn } from 'child_process'
import { randomUUID } from 'crypto'
import { reasonForJob, type ReasoningResult } from './ai-reason'
import { getAdapter } from './db-adapter'
import { getSetting } from './settings'
import { PATHS } from './paths'
import { parseCandidateInfo } from './candidate-info'
import { GenerationLogger } from './generation-logger'
import { ensureDefaultSession, getSession } from './sessions'
import { saveOutput } from './storage'
import { isCloud } from './app-mode'

export interface SSEEvent {
  stage: 'preflight' | 'ai-reason' | 'write-script' | 'build' | 'validate' | 'fix-loop' | 'pdf' | 'finalize' | 'done' | 'error'
  status: 'ok' | 'warn' | 'fail' | 'running'
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

  // Resolve master data once — used by all stages.
  // Priority: active DB profile > session.data > disk file (local-dev fallback only).
  // Both AI reasoning and build script must see the same data to keep work/project IDs consistent.
  // The disk file is Viet's personal local artifact — never override a user's uploaded profile with it.
  const activeProfile = await db.queryOne<{ data: string }>(
    'SELECT data FROM resume_profiles WHERE user_id = ? AND is_active = 1 LIMIT 1',
    [userId],
  )
  let masterDataJson = activeProfile?.data || session.data || ''
  if (!masterDataJson && !isCloud()) {
    try { masterDataJson = fs.readFileSync(PATHS.pipeline.masterData, 'utf8') } catch { /* file absent */ }
  }

  const { workIds: resolvedWorkIds } = parseCandidateInfo(masterDataJson)
  console.info(`[pipeline] job=${job.id} company="${job.company}" role="${job.role_title}" workIds=${JSON.stringify(resolvedWorkIds)}`)

  // Stage 0: Preflight
  if (signal?.aborted) { yield emit(errEvent('preflight', 'Aborted')); logger.finish('failed'); return }
  yield emit({ stage: 'preflight', status: 'running', data: {} })

  // Guard: no profile data at all
  if (!masterDataJson || masterDataJson.trim() === '' || masterDataJson.trim() === '{}') {
    yield emit(errEvent('preflight', 'No active resume profile found. Create one in Settings → Profiles.')); logger.finish('failed'); return
  }

  try {
    await preflight(masterDataJson, jobBuildDir)
  } catch (e) {
    yield emit(errEvent('preflight', String(e))); logger.finish('failed'); return
  }

  // Profile structure + minimum requirements
  const profileIssues = checkProfileStructure(masterDataJson)
  if (profileIssues.hardErrors.length > 0) {
    yield emit(errEvent('preflight', `Profile errors:\n${profileIssues.hardErrors.join('\n')}`))
    logger.finish('failed'); return
  }
  const preflightData: Record<string, unknown> = {}
  if (profileIssues.warnings.length > 0) {
    preflightData.warnings = profileIssues.warnings
  }
  yield emit({ stage: 'preflight', status: profileIssues.warnings.length > 0 ? 'warn' : 'ok', data: preflightData })

  // Stage 1: AI reasoning
  if (signal?.aborted) { yield emit(errEvent('ai-reason', 'Aborted')); logger.finish('failed'); return }
  yield emit({ stage: 'ai-reason', status: 'running', data: { workIds: resolvedWorkIds } })
  let decision: ReasoningResult
  try {
    decision = await reasonForJob(job.raw_content, masterDataJson, userId, signal)
  } catch (e) {
    const errMsg = String(e)
    console.error(`[pipeline] ai-reason failed: ${errMsg}`)
    yield emit(errEvent('ai-reason', errMsg)); logger.finish('failed'); return
  }
  logger.setAIDecision(decision as unknown as Record<string, unknown>)
  console.info(`[pipeline] ai-reason ok — track="${decision.track}" variant="${decision.workVariant}" workIds=${JSON.stringify(decision.workIds)} projects=${JSON.stringify(decision.projects)}`)
  yield emit({ stage: 'ai-reason', status: 'ok', data: decision as unknown as Record<string, unknown> })

  // Stage 2: Write build script
  if (signal?.aborted) { yield emit(errEvent('write-script', 'Aborted')); logger.finish('failed'); return }
  yield emit({ stage: 'write-script', status: 'running', data: {} })
  const slug = toSlug(`${job.company}_${job.role_title}`)

  const scriptName = `${slug}.js`
  const scriptPath = path.join(jobBuildDir, scriptName)
  const { nameSlug } = parseCandidateInfo(masterDataJson)
  const companyCamel = toCamelSlug(job.company)
  const roleCamel    = toCamelSlug(job.role_title)
  const docxName   = `${nameSlug}_${companyCamel}_${roleCamel}.docx`

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
    // validate:fail is non-terminal — fix-loop follows. Only build:fail and fix-loop:fail are terminal.
    if (event.status === 'fail' && event.stage !== 'validate') { logger.finish('failed'); return }
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
      // Upload to S3 — s3Key format: outputs/<userId>/<jobId>/<filename>
      finalDocxPath = await saveOutput(docxPath, `outputs/${userId}/${jobId}/${docxName}`)
      if (pdfPath) {
        try {
          finalPdfPath = await saveOutput(pdfPath, `outputs/${userId}/${jobId}/${pdfName}`)
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

    yield emit({ stage: 'finalize', status: 'ok', data: { path: finalDocxPath } })
    yield emit({ stage: 'done', status: 'ok', data: { outputId } })
  } catch (e) {
    yield emit(errEvent('finalize', String(e)))
    logger.finish('failed')
  }
}

interface ProfileCheck {
  hardErrors: string[]
  warnings:   string[]
}

function checkProfileStructure(json: string): ProfileCheck {
  const hardErrors: string[] = []
  const warnings:   string[] = []

  let data: Record<string, unknown>
  try {
    data = JSON.parse(json) as Record<string, unknown>
  } catch {
    hardErrors.push('Profile JSON is invalid — fix syntax errors before generating.')
    return { hardErrors, warnings }
  }

  const experience = (data.experience as Array<Record<string, unknown>> | undefined) ?? []
  const projects   = (data.projects   as Array<Record<string, unknown>> | undefined) ?? []

  // Hard minimum: at least 1 work entry + 1 project
  if (experience.length === 0) {
    hardErrors.push('Profile must have at least 1 work entry (experience[]).')
  }
  if (projects.length === 0) {
    hardErrors.push('Profile must have at least 1 project (projects[]).')
  }

  if (hardErrors.length > 0) return { hardErrors, warnings }

  // Structural integrity: each entry needs id + bullets
  for (const [i, exp] of experience.entries()) {
    if (!exp.id) hardErrors.push(`experience[${i}]: missing id field.`)
    if (!exp.bullets || typeof exp.bullets !== 'object' || Array.isArray(exp.bullets)) {
      hardErrors.push(`experience[${i}] (${exp.id ?? '?'}): missing bullets object — add { genai: [...], ... }.`)
    }
  }
  for (const [i, proj] of projects.entries()) {
    if (!proj.id) hardErrors.push(`projects[${i}]: missing id field.`)
    if (!Array.isArray(proj.bullets)) {
      hardErrors.push(`projects[${i}] (${proj.id ?? '?'}): bullets must be an array.`)
    }
  }

  if (hardErrors.length > 0) return { hardErrors, warnings }

  // Soft warnings: recommend ≥2 of each for a full 1-page resume
  if (experience.length < 2) warnings.push('Profile has only 1 work entry — resume may appear thin. Consider adding more experience.')
  if (projects.length   < 2) warnings.push('Profile has only 1 project — consider adding more for a fuller resume.')

  return { hardErrors, warnings }
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
      const errOut = (buildResult.stderr || buildResult.stdout).slice(0, 800)
      console.error(`[pipeline] build failed attempt=${attempt} code=${buildResult.code}\n${errOut}`)
      yield errEvent('build', errOut); return
    }
    console.info(`[pipeline] build ok attempt=${attempt} stdout=${buildResult.stdout.trim().slice(0, 200)}`)
    yield { stage: 'build', status: 'ok', data: { script: path.basename(scriptPath), attempt, out: buildResult.stdout.trim().slice(0, 200) } }

    if (!fs.existsSync(docxExpected)) {
      yield errEvent('build', `Build exited 0 but DOCX not found at ${docxExpected}`)
      return
    }

    // Validate
    yield { stage: 'validate', status: 'running', data: {} }
    const validateResult = await spawnAsync('node', [VALIDATE_JS, scriptPath], process.cwd(), signal)
    if (signal?.aborted) { yield errEvent('validate', 'Aborted'); return }
    console.info(`[pipeline] validate code=${validateResult.code} stdout=${validateResult.stdout.trim().slice(0, 300)}`)
    if (validateResult.code === 0) {
      const warns = validateResult.stdout.split('\n').filter(l => l.startsWith('WARN'))
      if (warns.length > 0) {
        yield { stage: 'validate', status: 'warn', data: { warnings: warns } }
      } else {
        yield { stage: 'validate', status: 'ok', data: {} }
      }
      yield { stage: 'finalize', status: 'ok', data: { docx: docxExpected } }
      return
    }

    const violations = validateResult.stdout.split('\n').filter(l => l.startsWith('FAIL'))
    console.warn(`[pipeline] validate violations: ${JSON.stringify(violations)}`)
    yield { stage: 'validate', status: 'fail', data: { violations } }

    yield { stage: 'fix-loop', status: 'running', data: { violations } }
    const fixed = applyFixes(scriptPath, violations)
    console.info(`[pipeline] fix-loop fixed=${JSON.stringify(fixed)} for violations=${JSON.stringify(violations)}`)
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
    // Tagline: trim to 76 chars at last word boundary
    const tlMatch = v.match(/FAIL tagline: (\d+)c/)
    if (tlMatch) {
      src = src.replace(/TL\((['"])((?:\\.|(?!\1).)*)\1\)/g, (_match, q, val) => {
        let trimmed = val.slice(0, 76)
        const lastSpace = trimmed.lastIndexOf(' ')
        if (lastSpace > 60) trimmed = trimmed.slice(0, lastSpace)
        fixed.push(`tagline trimmed to ${trimmed.length} chars`)
        return `TL(${q}${trimmed}${q})`
      })
    }

    // Bullet: trim over-length T() calls to 116 chars at word boundary
    const bulletMatch = v.match(/FAIL bullet \[(work|proj)\.\d+\]: (\d+)c/)
    if (bulletMatch) {
      let repCount = 0
      src = src.replace(/\bT\((['"])((?:\\.|(?!\1).)*)\1\)/g, (_m, q, val) => {
        if (val.length <= 116) return _m
        let trimmed = val.slice(0, 116)
        const lastSpace = trimmed.lastIndexOf(' ')
        if (lastSpace > 90) trimmed = trimmed.slice(0, lastSpace)
        repCount++
        return `T(${q}${trimmed}${q})`
      })
      if (repCount > 0) fixed.push(`${repCount} bullet(s) trimmed to ≤116 chars`)
    }

    // Para count: soft warning — mark handled, proceed without changes
    if (v.includes('FAIL para count')) {
      fixed.push('para count warning (skipped — cosmetic)')
    }

    // Skills: soft warning — mark handled, proceed without changes
    if (v.includes('FAIL skills')) {
      fixed.push('skills warning (skipped — cosmetic)')
    }
  }

  fs.writeFileSync(scriptPath, src, 'utf8')
  return fixed
}

function buildScript(d: ReasoningResult, _slug: string, docxName: string, masterDataJson: string): string {
  const master = JSON.parse(masterDataJson) as {
    contact?:   { name?: string; phone?: string; location?: string; email?: string; linkedin?: string; portfolio?: string; github?: string; work_auth?: string }
    experience: Array<{
      id: string; title?: string; company?: string; location?: string; dates?: string
      bullets: Record<string, string[]>
    }>
    projects: Array<{
      id: string; name?: string; url?: string; short_stack?: string; date?: string; dates?: string
      bullets: string[]
    }>
    skills: Record<string, Record<string, string>>
  }

  const variantKey = bulletsKey(d.workVariant)

  const workEntries = d.workIds.map(id => {
    const exp = master.experience.find(e => e.id === id)
    if (!exp) throw new Error(`Unknown work id: "${id}". Valid work IDs in profile: ${master.experience.map(e => e.id).join(', ')}`)
    if (!exp.bullets || typeof exp.bullets !== 'object') throw new Error(`Work entry "${id}" has no bullets object. Add { genai: [...], systems: [...] } etc. to this experience entry.`)
    const bullets = exp.bullets[variantKey] ?? exp.bullets['genai'] ?? []
    if (bullets.length === 0) throw new Error(`Work entry "${id}" has no bullets for variant "${variantKey}" and no genai fallback. Add bullets to this experience entry.`)
    return {
      id,
      title:    exp.title,
      company:  exp.company,
      location: exp.location,
      dates:    exp.dates,
      bullets:  bullets.slice(0, 5),
    }
  })

  const projectEntries = d.projects.map(id => {
    const proj = master.projects.find(p => p.id === id)
    if (!proj) throw new Error(`Unknown project id: "${id}". Valid project IDs in profile: ${master.projects.map(p => p.id).join(', ')}`)
    return {
      id,
      name:    proj.name,
      url:     proj.url,
      stack:   proj.short_stack,
      date:    proj.date ?? proj.dates,
      bullets: proj.bullets.slice(0, 3),
    }
  })

  const skillRows = d.skillsRows
  const candidateName = master.contact?.name
  const contact       = master.contact

  // validate.js requires unquoted JS object keys (not JSON) and T() wrappers on bullets
  const fmtWork = workEntries.map(w => {
    const bullets = w.bullets.map(b => `      T(${JSON.stringify(b)})`).join(',\n')
    return [
      `    {`,
      `      id: ${JSON.stringify(w.id)},`,
      w.title    ? `      title: ${JSON.stringify(w.title)},`    : null,
      w.company  ? `      company: ${JSON.stringify(w.company)},`  : null,
      w.location ? `      location: ${JSON.stringify(w.location)},` : null,
      w.dates    ? `      dates: ${JSON.stringify(w.dates)},`    : null,
      `      bullets: [\n${bullets},\n      ],`,
      `    }`,
    ].filter(Boolean).join('\n')
  }).join(',\n')

  const fmtProj = projectEntries.map(p => {
    const bullets = p.bullets.map(b => `      T(${JSON.stringify(b)})`).join(',\n')
    return [
      `    {`,
      `      id: ${JSON.stringify(p.id)},`,
      p.name  ? `      name: ${JSON.stringify(p.name)},`   : null,
      p.url   ? `      url: ${JSON.stringify(p.url)},`     : null,
      p.stack ? `      stack: ${JSON.stringify(p.stack)},` : null,
      p.date  ? `      date: ${JSON.stringify(p.date)},`   : null,
      `      bullets: [\n${bullets},\n      ],`,
      `    }`,
    ].filter(Boolean).join('\n')
  }).join(',\n')

  const fmtSkills = skillRows.map(s => {
    const colonIdx = s.indexOf(': ')
    if (colonIdx > 0) {
      const label = s.slice(0, colonIdx)
      const vals  = s.slice(colonIdx + 2)
      return `    { label: ${JSON.stringify(label)}, vals: ${JSON.stringify(vals)} }`
    }
    return `    { label: "", vals: ${JSON.stringify(s)} }`
  }).join(',\n')

  const fmtContact = contact ? JSON.stringify(contact, null, 4).split('\n').map((l, i) => i === 0 ? `  contact: ${l}` : `  ${l}`).join('\n') : null
  const fmtName    = candidateName ? `  name: ${JSON.stringify(candidateName)},` : null

  return `// Generated by ResumeLoop — ${new Date().toISOString()}
const { makeDoc, TL, T } = require('../buildv2.js');
const { Packer } = require('docx');
const fs = require('fs');
const path = require('path');

const doc = makeDoc({
${[fmtName, fmtContact ? `${fmtContact},` : null].filter(Boolean).join('\n')}
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
    let killTimer: ReturnType<typeof setTimeout> | null = null
    const onAbort = () => {
      proc.kill('SIGTERM')
      killTimer = setTimeout(() => proc.kill('SIGKILL'), 5000)
    }
    signal?.addEventListener('abort', onAbort, { once: true })
    proc.stdout.on('data', (d: Buffer) => out.push(d.toString()))
    proc.stderr.on('data', (d: Buffer) => errChunks.push(d.toString()))
    proc.on('close', code => {
      if (killTimer) { clearTimeout(killTimer); killTimer = null }
      signal?.removeEventListener('abort', onAbort)
      resolve({ code: code ?? 1, stdout: out.join(''), stderr: errChunks.join('') })
    })
    proc.on('error', e => {
      if (killTimer) { clearTimeout(killTimer); killTimer = null }
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

function toCamelSlug(s: string): string {
  return s
    .replace(/[^a-zA-Z0-9\s]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join('')
    .slice(0, 40)
}

function errEvent(stage: SSEEvent['stage'], message: string): SSEEvent {
  return { stage, status: 'fail', data: { message } }
}

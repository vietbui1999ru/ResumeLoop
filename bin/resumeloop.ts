#!/usr/bin/env -S npx tsx
/**
 * resumeloop CLI (ADR 0001 §11). Run via tsx today; wired as a global `bin`
 * when the tool is packaged for npm (#11).
 *
 *   resumeloop [dir]           boot the local web UI against a workspace (default: cwd)
 *   resumeloop init [dir]      scaffold a files-canonical workspace (default: cwd)
 *   resumeloop reindex [dir]   rebuild .cache/index.db from the job files
 *   resumeloop onboard [dir]   deterministic setup: pick + validate a provider, profile basics
 *   resumeloop import <cv> [dir]  AI-extract experience/projects/skills from a CV into profile.json
 *   resumeloop generate <job>  AI-tailor + render a .docx/.pdf for one indexed job
 *   resumeloop generate --batch [dir]  generate for every indexed job
 */
import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { createInterface } from 'node:readline/promises'
import { initWorkspace } from '../lib/workspace/init'
import { reindex } from '../lib/workspace/index-db'
import { workspaceRoot, profilePath } from '../lib/workspace/paths'
import { validateProvider, setProfileBasics } from '../lib/workspace/onboard'
import { extractProfile, applyExtractedProfile } from '../lib/workspace/import-cv'
import { listProviders, setActiveProviderId, getActiveProviderId } from '../lib/providers/active-provider'
import { getRunner } from '../lib/providers/factory'
import { listJobs, type IndexedJob } from '../lib/workspace/index-db'
import { resolveJobSelector, generateOne } from '../lib/workspace/generate'

/**
 * A prompt reader that works both interactively (TTY → readline) and for piped/
 * scripted input (non-TTY → buffer stdin upfront and serve a line per prompt).
 * readline/promises closes on stdin EOF, which crashes mid-wizard during the
 * async validation spawn when input is piped — this sidesteps that.
 */
function makeAsker(): { ask: (q: string) => Promise<string>; close: () => void } {
  if (process.stdin.isTTY) {
    const rl = createInterface({ input: process.stdin, output: process.stdout })
    return { ask: q => rl.question(q), close: () => rl.close() }
  }
  let lines: string[] = []
  try { lines = fs.readFileSync(0, 'utf8').split('\n') } catch { /* no stdin */ }
  let i = 0
  return {
    ask: async q => { const v = lines[i++] ?? ''; console.log(q + v); return v },
    close: () => {},
  }
}

/** Phase-1 onboarding: detect → pick → validate (test spawn) → profile basics. No AI content. */
async function onboard(root: string): Promise<number> {
  // Anchor workspace + provider config to this root for the whole command, so
  // setActiveProviderId (which reads RESUMELOOP_HOME) writes into the workspace.
  process.env.RESUMELOOP_HOME = root
  if (!fs.existsSync(profilePath(root))) initWorkspace(root)
  const rl = makeAsker()
  try {
    const providers = await listProviders()
    const installed = providers.filter(p => p.installed)
    console.log('\nDetected AI providers:')
    for (const p of providers) {
      console.log(`  ${p.installed ? '●' : '○'} ${p.id} [${p.transport}]${p.installed ? '' : '  (not detected)'}`)
    }
    if (installed.length === 0) {
      console.error('\nNo providers detected. Install a CLI (claude/codex/gemini/opencode) or start ollama, then re-run.')
      return 1
    }

    let chosen = ''
    const ids = installed.map(p => p.id)
    while (!ids.includes(chosen)) {
      chosen = (await rl.ask(`\nPick a provider [${ids.join(' / ')}]: `)).trim()
      if (!ids.includes(chosen)) console.log(`  "${chosen}" is not one of the detected options.`)
    }

    process.stdout.write(`Validating ${chosen} with a test spawn… `)
    const v = await validateProvider(chosen)
    console.log(v.ok ? 'ok ✓' : `failed ✗\n  ${v.detail}`)
    if (!v.ok) {
      const ans = (await rl.ask('Set it active anyway? [y/N]: ')).trim().toLowerCase()
      if (ans !== 'y') { console.error('Aborted — provider not validated.'); return 1 }
    }
    setActiveProviderId(chosen)

    const name = (await rl.ask('\nYour name: ')).trim()
    const email = (await rl.ask('Email: ')).trim()
    const location = (await rl.ask('Location: ')).trim()
    const targets = (await rl.ask('Target roles (comma-separated): ')).trim()
    setProfileBasics(root, {
      name: name || undefined,
      email: email || undefined,
      location: location || undefined,
      targetRoles: targets ? targets.split(',').map(s => s.trim()).filter(Boolean) : undefined,
    })

    console.log(`\n✓ Onboarding complete — provider "${chosen}" active, profile at ${profilePath(root)}`)
    console.log('  next: add jobs to data/jobs/*.md, then `resumeloop reindex`')
    return 0
  } finally {
    rl.close()
  }
}

/** Phase-2 onboarding: extract profile data from a CV file via the active provider. */
async function importCv(cvFile: string | undefined, root: string): Promise<number> {
  process.env.RESUMELOOP_HOME = root
  if (!fs.existsSync(profilePath(root))) initWorkspace(root)

  const providerId = getActiveProviderId()
  if (!providerId) {
    console.error('No active provider. Run `resumeloop onboard` first.')
    return 1
  }
  if (!cvFile || !fs.existsSync(cvFile)) {
    console.error('Usage: resumeloop import <cv-file> [dir]')
    return 1
  }
  const cvText = fs.readFileSync(cvFile, 'utf8')
  if (!cvText.trim()) { console.error('CV file is empty.'); return 1 }

  console.log(`Extracting profile from ${cvFile} via ${providerId}…`)
  let extracted
  try {
    extracted = await extractProfile(cvText, getRunner(providerId))
  } catch (e) {
    console.error(`\nExtraction failed: ${(e as Error).message}`)
    console.error('Fallback: edit data/profile.json manually (experience[] / projects[] / skills{}).')
    return 1
  }

  console.log(
    `\nExtracted: ${extracted.experience.length} experience, ` +
    `${extracted.projects.length} projects, ${Object.keys(extracted.skills).length} skill categories`,
  )
  for (const e of extracted.experience) console.log(`  • ${e.title} @ ${e.company} — ${e.bullets.length} bullets`)
  for (const p of extracted.projects) console.log(`  • project: ${p.name} — ${p.bullets.length} bullets`)

  const asker = makeAsker()
  let ok = false
  try {
    ok = (await asker.ask('\nWrite this into profile.json? [y/N]: ')).trim().toLowerCase() === 'y'
  } finally {
    asker.close()
  }
  if (!ok) { console.log('Discarded — nothing written.'); return 0 }

  applyExtractedProfile(root, extracted)
  reindex(root) // keep the workspace index fresh after the profile changes
  console.log(`✓ Imported → ${profilePath(root)} (reindexed)`)
  return 0
}

function printCandidates(jobs: IndexedJob[]): void {
  for (const j of jobs) console.error(`  ${j.id} — ${j.company} — ${j.role_title}`)
}

async function reportGenerate(root: string, job: IndexedJob, runner: import('../lib/providers/types').CliRunner): Promise<void> {
  const result = await generateOne(root, job, runner)
  console.log(`✓ ${job.company} — ${job.role_title} → ${path.relative(root, result.docxPath)} (fit ${result.decision.fitPct}%, ${result.decision.fitNote})`)
  if (result.pdfError) console.log(`  ⚠ PDF generation failed (non-fatal): ${result.pdfError}`)
}

/** `resumeloop generate <job-selector>` / `resumeloop generate --batch`. Files-canonical only — never touches resume.db. */
async function generateCmd(selectorArg: string | undefined, batch: boolean, root: string): Promise<number> {
  process.env.RESUMELOOP_HOME = root
  if (!fs.existsSync(profilePath(root))) {
    console.error(`No workspace found at ${root}. Run 'resumeloop init' first.`)
    return 1
  }
  const providerId = getActiveProviderId()
  if (!providerId) {
    console.error('No active provider. Run `resumeloop onboard` first.')
    return 1
  }
  const jobs = listJobs(root)
  if (jobs.length === 0) {
    console.error("No jobs indexed. Run 'resumeloop reindex' first.")
    return 1
  }
  const runner = getRunner(providerId)

  if (batch) {
    let ok = 0, failed = 0
    for (const job of jobs) {
      try {
        await reportGenerate(root, job, runner)
        ok++
      } catch (e) {
        console.error(`✗ ${job.company} — ${job.role_title}: ${(e as Error).message}`)
        failed++
      }
    }
    console.log(`\n${ok}/${ok + failed} generated${failed ? `, ${failed} failed — see errors above` : ''}`)
    return failed > 0 && ok === 0 ? 1 : 0
  }

  if (!selectorArg) {
    console.error('Usage: resumeloop generate <job-id-or-slug> [dir]')
    return 1
  }
  const resolved = resolveJobSelector(jobs, selectorArg)
  if (resolved.kind === 'none') {
    console.error(`No job matches "${selectorArg}". Available jobs:`)
    printCandidates(jobs)
    return 1
  }
  if (resolved.kind === 'ambiguous') {
    console.error(`"${selectorArg}" matches multiple jobs — be more specific:`)
    printCandidates(resolved.candidates)
    return 1
  }
  try {
    await reportGenerate(root, resolved.job, runner)
    return 0
  } catch (e) {
    console.error((e as Error).message)
    return 1
  }
}

/** Poll /api/health until the server responds, or give up after `timeoutMs`. */
async function waitForHealth(url: string, timeoutMs = 30_000): Promise<void> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${url}/api/health`)
      if (res.ok) return
    } catch { /* not up yet */ }
    await new Promise(r => setTimeout(r, 300))
  }
  throw new Error('timed out waiting for /api/health')
}

/** Boot the local web UI against `root` — prebuilt standalone server if present, else `next dev`. */
async function boot(root: string): Promise<number> {
  process.env.RESUMELOOP_HOME = root
  if (!fs.existsSync(profilePath(root))) initWorkspace(root)

  const packageRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
  const standaloneServer = path.join(packageRoot, '.next', 'standalone', 'server.js')
  const port = process.env.PORT ?? '3000'
  const dbPath = process.env.DB_PATH ?? path.join(root, '.cache', 'resume.db')
  fs.mkdirSync(path.dirname(dbPath), { recursive: true })

  const env = { ...process.env, PORT: port, HOSTNAME: '127.0.0.1', RESUMELOOP_HOME: root, DB_PATH: dbPath }

  const child = fs.existsSync(standaloneServer)
    ? spawn('node', ['server.js'], { cwd: path.dirname(standaloneServer), env, stdio: 'inherit' })
    : (console.log('No prebuilt .next/standalone found — starting in dev mode (`next dev`). Run `npm run build` for a faster boot.'),
       spawn('npx', ['next', 'dev', '-H', '127.0.0.1', '-p', port], { cwd: packageRoot, env, stdio: 'inherit' }))

  const url = `http://127.0.0.1:${port}`
  waitForHealth(url).then(
    () => console.log(`✓ ResumeLoop running at ${url}`),
    () => { /* health check didn't respond in time — child's own stdio already shows why */ },
  )

  for (const sig of ['SIGINT', 'SIGTERM'] as const) {
    process.on(sig, () => child.kill(sig))
  }

  return new Promise<number>(resolve => {
    child.on('close', code => resolve(code ?? 1))
  })
}

const KNOWN_COMMANDS = ['init', 'reindex', 'onboard', 'import', 'generate']

async function main(argv: string[]): Promise<number> {
  const [cmd, dir] = argv
  const resolveRoot = (fallback: string) => (dir ? path.resolve(dir) : fallback)

  // No args: boot against the current workspace. A single arg that isn't a
  // known subcommand is treated as `resumeloop <dir>` (boot against that dir),
  // matching the way every other command accepts an optional trailing dir.
  if (!cmd) return boot(workspaceRoot())
  if (!KNOWN_COMMANDS.includes(cmd)) return boot(path.resolve(cmd))

  switch (cmd) {
    case 'init': {
      const root = resolveRoot(process.cwd())
      const { created } = initWorkspace(root)
      console.log(`✓ workspace ready at ${root} (${created.length} path(s) created)`)
      console.log('  next: `resumeloop onboard` to pick a provider + fill your profile')
      return 0
    }
    case 'reindex': {
      const root = resolveRoot(workspaceRoot())
      const { jobs } = reindex(root)
      console.log(`✓ reindexed ${jobs} job(s) → ${root}/.cache/index.db`)
      return 0
    }
    case 'onboard':
      return onboard(resolveRoot(workspaceRoot()))
    case 'import':
      // resumeloop import <cv-file> [dir]
      return importCv(argv[1], argv[2] ? path.resolve(argv[2]) : workspaceRoot())
    case 'generate': {
      // resumeloop generate <job-id-or-slug> [dir]
      // resumeloop generate --batch [dir]
      const rest = argv.slice(1)
      const batch = rest.includes('--batch')
      const positional = rest.filter(a => !a.startsWith('--'))
      const selectorArg = batch ? undefined : positional[0]
      const dirArg = batch ? positional[0] : positional[1]
      const root = dirArg ? path.resolve(dirArg) : workspaceRoot()
      return generateCmd(selectorArg, batch, root)
    }
    default:
      console.error('usage: resumeloop <init|reindex|onboard|import|generate> [args]')
      console.error('  import <cv-file> [dir]        AI-extract profile from a CV')
      console.error('  generate <job-id-or-slug>      tailor + render a resume for one job')
      console.error('  generate --batch [dir]         generate for every indexed job')
      return 1
  }
}

main(process.argv.slice(2)).then(code => process.exit(code))

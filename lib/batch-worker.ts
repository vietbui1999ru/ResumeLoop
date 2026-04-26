import fs from 'fs'
import path from 'path'
import os from 'os'
import { runNodeScript } from './run-script'
import type { JdJob } from './jd-parser'

const PIPELINE_DIR = path.join(process.cwd(), 'pipeline')
const BATCH_BUILD_DIR = path.join(PIPELINE_DIR, 'batch-build')
const MASTER_JSON = path.join(PIPELINE_DIR, 'master_resume_data.json')

// Bullet variant keys that exist in master_resume_data.json experience entries
type BulletVariant = 'genai' | 'systems' | 'fullstack' | 'sre'

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
  variant: BulletVariant
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

// Map fit-scorer role_track → bullet variant key in master_resume_data.json
function pickVariant(roleTrack: string): BulletVariant {
  const sre = ['SRE/DevOps', 'Network Engineer', 'Cloud']
  const systems = ['Embedded/Systems', 'Rust/Systems', 'Backend/API']
  const it = ['IT/Helpdesk']
  if (sre.includes(roleTrack)) return 'sre'
  if (systems.includes(roleTrack)) return 'systems'
  if (it.includes(roleTrack)) return 'fullstack'
  return 'genai'
}

function pickWorkIds(roleTrack: string): string[] {
  if (roleTrack === 'IT/Helpdesk') return ['gitlab', 'udayton', 'augustana']
  return ['gitlab', 'carboncopies', 'udayton']
}

function getWorkBullets(master: Master, workId: string, variant: BulletVariant): string[] {
  const entry = master.experience.find(e => e.id === workId)
  if (!entry) throw new Error(`Work ID not in master: ${workId}`)
  // Fall back through variant priority chain
  const bullets = entry.bullets[variant]
    ?? entry.bullets['genai']
    ?? entry.bullets['systems']
    ?? entry.bullets['fullstack']
  if (!bullets) throw new Error(`No bullets for ${workId}/${variant}`)
  return bullets.slice(0, 5)
}

// Map fit-scorer role_track → role_track_picks key in master_resume_data.json
function pickProjectIds(roleTrack: string, master: Master): string[] {
  const trackMap: Record<string, string> = {
    'AI/LLM/Agents':     'AI/LLM/Agents',
    'SRE/DevOps':        'SRE/DevOps',
    'Backend/API':       'Distributed/Infra',
    'Software Engineer': '.NET/Full-Stack',
    'Data Engineer':     'Data/ML',
    'Data Analyst':      'Data/ML',
    'ML Engineer':       'Data/ML',
    'Embedded/Systems':  'Embedded/Systems',
    'Network Engineer':  'Distributed/Infra',
    'Security':          'Security/Research',
    'QA/Testing':        '.NET/Full-Stack',
    'IT/Helpdesk':       'AI Tooling/DevTools',
    'Cloud':             'SRE/DevOps',
    'Rust/Systems':      'Rust/Systems',
    '.NET/C#':           '.NET/Full-Stack',
  }
  const key = trackMap[roleTrack] ?? '.NET/Full-Stack'
  const fallback = master.role_track_picks['.NET/Full-Stack'] ?? []
  return (master.role_track_picks[key] ?? fallback).slice(0, 3)
}

function getProjectBullets(master: Master, projectId: string): string[] {
  const proj = master.projects.find(p => p.id === projectId)
  if (!proj) throw new Error(`Project ID not found: ${projectId}`)
  return proj.bullets.slice(0, 3)
}

// Map variant → skills key in master_resume_data.json
function pickSkillsKey(variant: BulletVariant): string {
  if (variant === 'sre') return 'sre_devops'
  if (variant === 'systems') return 'systems'
  if (variant === 'fullstack') return 'fullstack'
  return 'genai'
}

function inferTagline(job: JdJob, variant: BulletVariant): string {
  const title = job.role_title.slice(0, 40)
  const tech = variant === 'systems' ? 'Go and Python'
    : variant === 'sre' ? 'Go, Terraform, and Prometheus'
    : variant === 'fullstack' ? 'React and TypeScript'
    : 'Python and TypeScript'
  const candidate = `${title} building distributed systems with ${tech}`
  return candidate.length <= 76 ? candidate : `${title} — distributed systems, ${tech}`.slice(0, 76)
}

export async function buildJob(job: JdJob & { role_track?: string }): Promise<WorkerResult> {
  const master: Master = JSON.parse(fs.readFileSync(MASTER_JSON, 'utf8'))
  const roleTrack = job.role_track ?? 'Software Engineer'
  const variant = pickVariant(roleTrack)
  const workIds = pickWorkIds(roleTrack)
  const projectIds = pickProjectIds(roleTrack, master)
  const skillsKey = pickSkillsKey(variant)
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
  const outDirJson = JSON.stringify(outputDir)
  const docxFilenameJson = JSON.stringify(docxFilename)
  const paramsJson = JSON.stringify(params, null, 2)

  const script = [
    "const { makeDoc } = require('./buildv2')",
    "const { Packer } = require('docx')",
    "const fs = require('fs'), path = require('path')",
    "",
    `const OUT = ${outDirJson}`,
    `const data = ${paramsJson}`,
    "",
    "async function run() {",
    "  const doc = makeDoc(data)",
    "  const buf = await Packer.toBuffer(doc)",
    "  fs.mkdirSync(OUT, { recursive: true })",
    `  fs.writeFileSync(path.join(OUT, ${docxFilenameJson}), buf)`,
    `  console.log('\\u2713 ' + path.join(OUT, ${docxFilenameJson}))`,
    "}",
    "run().catch(e => { console.error(e.message); process.exit(1) })",
  ].join('\n')

  fs.writeFileSync(path.join(BATCH_BUILD_DIR, scriptName), script)

  const result = await runNodeScript(scriptName, BATCH_BUILD_DIR)
  if (result.code !== 0) {
    throw new Error(`Build failed: ${result.stderr || result.stdout}`)
  }

  return { job_id: job.id, docx_path: docxPath, build_params: params, variant }
}

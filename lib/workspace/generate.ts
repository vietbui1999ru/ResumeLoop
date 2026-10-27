import fs from 'node:fs'
import path from 'node:path'
import { parseJd } from '../jd-parser'
import { readProfile } from './read'
import { resumesDir } from './paths'
import { decideForJob, renderDocxBuffer, renderResumePdf, type SpineDecision } from '../providers/spine'
import type { CliRunner } from '../providers/types'
import type { IndexedJob } from './index-db'
import { writeEvaluation } from './evaluations'

export type JobSelection =
  | { kind: 'found'; job: IndexedJob }
  | { kind: 'none' }
  | { kind: 'ambiguous'; candidates: IndexedJob[] }

/**
 * Resolve a user-typed selector against the indexed job list: an exact `id`
 * match wins outright; otherwise a case-insensitive partial match against
 * id/company/role_title (a convenience — a user types `acme`, not a slug).
 */
export function resolveJobSelector(jobs: IndexedJob[], selector: string): JobSelection {
  const exact = jobs.find(j => j.id === selector)
  if (exact) return { kind: 'found', job: exact }

  const needle = selector.toLowerCase()
  const matches = jobs.filter(j =>
    j.id.toLowerCase().includes(needle) ||
    j.company.toLowerCase().includes(needle) ||
    j.role_title.toLowerCase().includes(needle),
  )
  if (matches.length === 0) return { kind: 'none' }
  if (matches.length === 1) return { kind: 'found', job: matches[0] }
  return { kind: 'ambiguous', candidates: matches }
}

export interface GenerateResult {
  job: IndexedJob
  decision: SpineDecision
  docxPath: string
  pdfPath: string | null
  pdfError?: string
  evaluationPath: string
}

function slug(...parts: string[]): string {
  return parts.join('_').replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 80)
}

/**
 * Generate one job's tailored resume: JD -> decideForJob -> .docx (+ non-fatal
 * .pdf) -> audit record. Files-canonical only — never touches the web app's
 * SQLite resume.db/jd_jobs table.
 */
export async function generateOne(
  root: string | undefined,
  job: IndexedJob,
  runner: CliRunner,
): Promise<GenerateResult> {
  const profile = readProfile(root)
  if (!profile) {
    throw new Error("No profile.json found — run 'resumeloop onboard' then 'resumeloop import <cv>'.")
  }
  const profileJson = JSON.stringify(profile)

  const raw = fs.readFileSync(job.file_path, 'utf8')
  const { raw_content } = parseJd(job.file_path, raw)

  const decision = await decideForJob(raw_content, profileJson, runner)

  const outDir = resumesDir(root)
  fs.mkdirSync(outDir, { recursive: true })
  const base = slug(job.company, job.role_title)

  const docxBuf = await renderDocxBuffer(decision, profileJson)
  const docxPath = path.join(outDir, `${base}.docx`)
  fs.writeFileSync(docxPath, docxBuf)

  let pdfPath: string | null = null
  let pdfError: string | undefined
  try {
    const pdfBuf = await renderResumePdf(decision, profileJson)
    pdfPath = path.join(outDir, `${base}.pdf`)
    fs.writeFileSync(pdfPath, pdfBuf)
  } catch (e) {
    // Non-fatal — Playwright/Chromium issues are common and shouldn't block the .docx.
    pdfError = (e as Error).message
  }

  const evaluationPath = writeEvaluation(root, job, decision)

  return { job, decision, docxPath, pdfPath, pdfError, evaluationPath }
}

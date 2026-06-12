import { createRequire } from 'node:module'
import path from 'node:path'
import { z } from 'zod'
import { createAdapter } from './adapter'
import type { CliRunner } from './types'
import {
  MAX_BULLET_CHARS, MAX_TAGLINE_CHARS,
  BULLET_WORD_BOUNDARY_MIN, TAGLINE_WORD_BOUNDARY_MIN,
} from '../config'

/** Truncate to `max` chars on a word boundary (mirrors the generate pipeline's trim). */
function trimTo(s: string, max: number, boundaryMin: number): string {
  if (s.length <= max) return s
  const cut = s.slice(0, max)
  const ls = cut.lastIndexOf(' ')
  return ls > boundaryMin ? cut.slice(0, ls) : cut
}

/**
 * The tracer-bullet decision: one structured object the brain returns for a JD,
 * carrying both the fit assessment and the resume selections needed to render an
 * ATS .docx. A trimmed cousin of ReasoningResult — kept self-contained so the
 * spine proves the architecture without entangling the full pipeline (ADR 0001).
 */
export const SpineDecisionSchema = z.object({
  fitPct:      z.number().int().min(0).max(100),
  fitNote:     z.string().min(1),
  track:       z.string().min(1),
  workVariant: z.enum(['genai', 'systems', 'fullstack', 'sre', 'IT-track']),
  workIds:     z.array(z.string()).min(1).max(6),
  projects:    z.array(z.string()).min(1).max(6),
  tagline:     z.string().min(1).max(76),
  skillsRows:  z.array(z.string()).min(1).max(8),
})
export type SpineDecision = z.infer<typeof SpineDecisionSchema>

interface MasterData {
  contact?: { name?: string }
  experience: Array<{
    id: string; title: string; company: string; location: string; dates: string
    bullets: Record<string, string[]>
  }>
  projects: Array<{
    id: string; name: string; url?: string; short_stack?: string
    date?: string; dates?: string; bullets: string[]
  }>
}

/** Run a JD through the adapter to get a validated SpineDecision. */
export async function decideForJob(
  jdText: string,
  masterDataJson: string,
  runner: CliRunner,
  signal?: AbortSignal,
): Promise<SpineDecision> {
  const master = JSON.parse(masterDataJson) as MasterData
  const workIds = master.experience.map(e => e.id)
  const projectIds = master.projects.map(p => p.id)

  const prompt = [
    'You are tailoring a one-page ATS resume to the job description below.',
    `Choose exactly 3 work IDs from: ${workIds.join(', ')}`,
    `Choose exactly 3 project IDs from: ${projectIds.join(', ')}`,
    'Choose the work variant that best fits the role.',
    'Write a value-oriented tagline of at most 76 characters. Do not use em-dashes.',
    'Provide 3-5 skills rows, each formatted "Label: Tech · Tech · Tech".',
    'Assess fit from 0 to 100 with a one-sentence note.',
    '',
    '<job_description>',
    jdText,
    '</job_description>',
  ].join('\n')

  return createAdapter(runner).runStructured(SpineDecisionSchema, prompt, {
    shapeHint:
      '{ fitPct: int 0-100, fitNote: string, track: string, ' +
      'workVariant: "genai"|"systems"|"fullstack"|"sre"|"IT-track", ' +
      'workIds: [3 ids], projects: [3 ids], tagline: string <=76 chars, ' +
      'skillsRows: ["Label: a · b · c", ...] }',
    signal,
  })
}

/** Render an ATS .docx from a decision + master data using the buildv2 (docx npm) engine. */
export async function renderDocxBuffer(decision: SpineDecision, masterDataJson: string): Promise<Buffer> {
  const master = JSON.parse(masterDataJson) as MasterData

  // Anchor at the tracked buildv2.js; 'docx' resolves up to the root node_modules (a real dep).
  const anchor = path.join(process.cwd(), 'pipeline', 'buildv2.js')
  const req = createRequire(anchor)
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const { makeDoc, T, TL } = req('./buildv2.js') as any
  const { Packer } = req('docx') as any
  /* eslint-enable @typescript-eslint/no-explicit-any */

  const work = decision.workIds.map(id => {
    const exp = master.experience.find(e => e.id === id)
    if (!exp) throw new Error(`Unknown work id "${id}". Valid: ${master.experience.map(e => e.id).join(', ')}`)
    const bullets = (exp.bullets[decision.workVariant] ?? exp.bullets['genai'] ?? []).slice(0, 5)
    return { id, title: exp.title, company: exp.company, location: exp.location, dates: exp.dates,
             bullets: bullets.map((b: string) => T(trimTo(b, MAX_BULLET_CHARS, BULLET_WORD_BOUNDARY_MIN))) }
  })

  const projects = decision.projects.map(id => {
    const p = master.projects.find(x => x.id === id)
    if (!p) throw new Error(`Unknown project id "${id}". Valid: ${master.projects.map(x => x.id).join(', ')}`)
    return { id, name: p.name, url: p.url, stack: p.short_stack, date: p.date ?? p.dates,
             bullets: p.bullets.slice(0, 3).map((b: string) => T(trimTo(b, MAX_BULLET_CHARS, BULLET_WORD_BOUNDARY_MIN))) }
  })

  const skills = decision.skillsRows.map(s => {
    const i = s.indexOf(': ')
    return i > 0 ? { label: s.slice(0, i), vals: s.slice(i + 2) } : { label: '', vals: s }
  })

  const doc = makeDoc({ name: master.contact?.name, contact: master.contact,
    tagline: TL(trimTo(decision.tagline, MAX_TAGLINE_CHARS, TAGLINE_WORD_BOUNDARY_MIN)), work, projects, skills })
  return Packer.toBuffer(doc) as Promise<Buffer>
}

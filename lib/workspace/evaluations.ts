import fs from 'node:fs'
import path from 'node:path'
import { evaluationsDir } from './paths'
import type { IndexedJob } from './index-db'
import type { SpineDecision } from '../providers/spine'

/**
 * Write a git-trackable, human-readable audit record after a successful
 * `resumeloop generate` — one markdown file per job (data/evaluations/<id>.md),
 * not a single growing log. Never mutates the job file's Action frontmatter:
 * that tracks real application-pipeline stage, not generation state.
 */
export function writeEvaluation(root: string | undefined, job: IndexedJob, decision: SpineDecision): string {
  const dir = evaluationsDir(root)
  fs.mkdirSync(dir, { recursive: true })
  const file = path.join(dir, `${job.id}.md`)
  const body = [
    `# ${job.company} — ${job.role_title}`,
    '',
    `- Generated: ${new Date().toISOString()}`,
    `- Fit: ${decision.fitPct}% — ${decision.fitNote}`,
    `- Track: ${decision.track}`,
    `- Variant: ${decision.workVariant}`,
    `- Work IDs: ${decision.workIds.join(', ')}`,
    `- Projects: ${decision.projects.join(', ')}`,
    `- Tagline: ${decision.tagline}`,
    '',
  ].join('\n')
  fs.writeFileSync(file, body)
  return file
}

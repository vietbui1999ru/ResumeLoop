import fs from 'fs'
import path from 'path'
import { createPatch } from 'diff'
import { jsonSchema } from 'ai'
import { getSession } from './sessions'

const ROOT = process.cwd()

// Proprietary prompt files (ats-optimization-guidelines, CLAUDE-full, ats-optimized-resume-system,
// spec-job-match-resume-generator) are intentionally excluded — they live in system_prompts DB
// and must never be readable or editable via the chat tool interface.
export const FILE_MAP: Record<string, string> = {
  master_resume_data: path.join(ROOT, 'pipeline', 'master_resume_data.json'),
}

export type FileKey = keyof typeof FILE_MAP

export const READ_FILE_SCHEMA = jsonSchema<{ file: FileKey }>({
  type: 'object',
  properties: {
    file: { type: 'string', enum: Object.keys(FILE_MAP) },
  },
  required: ['file'],
})

export const PROPOSE_EDIT_SCHEMA = jsonSchema<{ file: FileKey; description: string; new_content: string }>({
  type: 'object',
  properties: {
    file:        { type: 'string', enum: Object.keys(FILE_MAP) },
    description: { type: 'string', description: 'One-sentence summary of what changes and why' },
    new_content: { type: 'string', description: 'Full new file content (entire file, not a patch)' },
  },
  required: ['file', 'description', 'new_content'],
})

export async function handleReadFile(file: FileKey, sessionId = 'default', userId = 'default'): Promise<string> {
  const MAX_CHARS = file === 'master_resume_data' ? 120000 : 8000

  if (file === 'master_resume_data') {
    const session = await getSession(sessionId, userId)
    const content = session?.data && session.data !== '{}' ? session.data : null
    if (content) {
      return content.length > MAX_CHARS
        ? content.slice(0, MAX_CHARS) + '\n[truncated — do not propose edits based on this partial content]'
        : content
    }
  }

  const filePath = FILE_MAP[file as string]
  if (!filePath) return `Error: unknown file key "${file}"`
  try {
    const content = fs.readFileSync(filePath, 'utf8')
    return content.length > MAX_CHARS
      ? content.slice(0, MAX_CHARS) + '\n[truncated — do not propose edits based on this partial content]'
      : content
  } catch {
    return `Error: could not read ${file}`
  }
}

export interface ProposeEditResult {
  diff?: string
  error?: string
}

export async function handleProposeEdit(
  file: FileKey,
  description: string,
  new_content: string,
): Promise<ProposeEditResult> {
  const filePath = FILE_MAP[file as string]
  if (!filePath) return { error: `Unknown file key "${file}"` }

  if (file === 'master_resume_data') {
    try { JSON.parse(new_content) } catch {
      return { error: 'Invalid JSON: new_content did not parse. Fix the JSON and try again.' }
    }
  }

  let current = ''
  try { current = fs.readFileSync(filePath, 'utf8') } catch { /* file may not exist yet */ }

  const diff = createPatch(file as string, current, new_content, 'current', 'proposed')
  return { diff }
}

import fs from 'fs'
import path from 'path'
import { createPatch } from 'diff'
import type Anthropic from '@anthropic-ai/sdk'

const ROOT = process.cwd()

export const FILE_MAP: Record<string, string> = {
  master_resume_data: path.join(ROOT, 'pipeline', 'master_resume_data.json'),
  claude_full:        path.join(ROOT, 'docs', 'reference', 'CLAUDE-full.md'),
  ats_guidelines:     path.join(ROOT, 'docs', 'reference', 'ats-optimization-guidelines.md'),
  ats_system:         path.join(ROOT, 'docs', 'reference', 'ats-optimized-resume-system.md'),
  spec:               path.join(ROOT, 'CLAUDE.md'),
}

export type FileKey = keyof typeof FILE_MAP

export const CHAT_TOOLS: Anthropic.Tool[] = [
  {
    name: 'read_file',
    description: 'Read a profile file. Use before proposing edits.',
    input_schema: {
      type: 'object' as const,
      properties: {
        file: { type: 'string', enum: Object.keys(FILE_MAP) },
      },
      required: ['file'],
    },
  },
  {
    name: 'propose_edit',
    description: 'Propose a change to a profile file. The user must Accept before the file is written.',
    input_schema: {
      type: 'object' as const,
      properties: {
        file:        { type: 'string', enum: Object.keys(FILE_MAP) },
        description: { type: 'string', description: 'One-sentence summary of what changes and why' },
        new_content: { type: 'string', description: 'Full new file content (entire file, not a patch)' },
      },
      required: ['file', 'description', 'new_content'],
    },
  },
]

export async function handleReadFile(file: FileKey): Promise<string> {
  const filePath = FILE_MAP[file as string]
  if (!filePath) return `Error: unknown file key "${file}"`
  try {
    const content = fs.readFileSync(filePath, 'utf8')
    return content.length > 8000 ? content.slice(0, 8000) + '\n[truncated]' : content
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

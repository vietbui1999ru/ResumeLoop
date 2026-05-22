import 'server-only'
import fs from 'fs'
import { PATHS } from './paths'
import { getAdapter } from './db-adapter'

export interface CandidateInfo {
  name:     string    // full name from contact.name, or "the candidate"
  email:    string    // contact.email or ""
  workAuth: string    // contact.work_auth or ""
  workIds:  string[]  // experience[].id in order
  nameSlug: string    // "FirstLast" format for filenames, or "Resume"
}

/** Pure parser — no I/O. Safe to call in tests with a raw JSON string. */
export function parseCandidateInfo(masterDataJson: string): CandidateInfo {
  const FALLBACK: CandidateInfo = {
    name: 'the candidate', email: '', workAuth: '', workIds: [], nameSlug: 'Resume',
  }
  try {
    const d = JSON.parse(masterDataJson) as Record<string, unknown>
    const contact = (d.contact ?? {}) as Record<string, string>
    const name    = contact.name?.trim() || 'the candidate'
    const workIds = ((d.experience as Array<{ id: string }>) ?? [])
      .map(e => e.id)
      .filter(Boolean)
    const nameSlug = name
      .replace(/[^a-zA-Z ]/g, '')
      .split(/\s+/)
      .filter(Boolean)
      .map(w => w.charAt(0).toUpperCase() + w.slice(1))
      .join('') || 'Resume'
    return { name, email: contact.email ?? '', workAuth: contact.work_auth ?? '', workIds, nameSlug }
  } catch {
    return FALLBACK
  }
}

/**
 * Formats role_track_picks as readable instructions.
 * Falls back to empty string if the field is missing.
 */
export function parseRoleTrackInstructions(masterDataJson: string): string {
  try {
    const d = JSON.parse(masterDataJson) as Record<string, unknown>
    const picks = d.role_track_picks as Record<string, string[]> | undefined
    if (!picks || typeof picks !== 'object') return ''
    const lines = ['## Role-Track → Project Picks', '(Use this table to choose the right 3 projects for the detected role track)']
    for (const [track, projects] of Object.entries(picks)) {
      if (Array.isArray(projects) && projects.length) {
        lines.push(`- **${track}**: ${projects.join(', ')}`)
      }
    }
    return lines.join('\n')
  } catch {
    return ''
  }
}

/**
 * Formats resume_rules as hard constraints for the prompt.
 * Skips boolean false values. Falls back to empty string.
 */
export function parseResumeRules(masterDataJson: string): string {
  try {
    const d = JSON.parse(masterDataJson) as Record<string, unknown>
    const rules = d.resume_rules as Record<string, unknown> | undefined
    if (!rules || typeof rules !== 'object') return ''
    const lines: string[] = []
    for (const [key, val] of Object.entries(rules)) {
      if (val === false) continue
      if (val === true) {
        lines.push(`- ${key.replace(/_/g, ' ')}`)
      } else if (typeof val === 'string') {
        lines.push(`- ${key.replace(/_/g, ' ')}: ${val}`)
      } else if (Array.isArray(val)) {
        lines.push(`- ${key.replace(/_/g, ' ')}: ${val.join(' → ')}`)
      }
    }
    return lines.length ? `## Resume Rules (hard)\n${lines.join('\n')}` : ''
  } catch {
    return ''
  }
}

/** Loads master data JSON: disk file first (always current), then active DB profile. */
export async function getMasterData(userId: string): Promise<string> {
  try {
    return fs.readFileSync(PATHS.pipeline.masterData, 'utf8')
  } catch {
    const db = await getAdapter()
    const row = await db.queryOne<{ data: string }>(
      'SELECT data FROM resume_profiles WHERE user_id = ? AND is_active = 1 LIMIT 1',
      [userId],
    )
    return row?.data ?? '{}'
  }
}

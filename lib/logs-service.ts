import fs from 'fs'
import path from 'path'
import { listLogs, readLog, type GenerationLog } from './generation-logger'

const LOG_DIR = path.join(process.cwd(), 'logs', 'generate')
const ID_RE   = /^[\w-]+__\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}$/

export interface LogSummary {
  id:            string
  jobId:         string
  company:       string
  role_title:    string
  outcome?:      'success' | 'failed'
  started_at:    string
  completed_at?: string
  stage_count:   number
}

export function resolveLogPath(id: string): string | null {
  if (!ID_RE.test(id)) return null
  const resolved = path.join(LOG_DIR, `${id}.json`)
  if (!resolved.startsWith(LOG_DIR + path.sep)) return null
  return resolved
}

export function toSummary(log: GenerationLog, id: string): LogSummary {
  return {
    id,
    jobId:        log.jobId,
    company:      log.company,
    role_title:   log.role_title,
    outcome:      log.outcome,
    started_at:   log.started_at,
    completed_at: log.completed_at,
    stage_count:  log.stages.length,
  }
}

export function listSummaries(opts: { limit: number; jobId?: string }): LogSummary[] {
  return listLogs(opts.jobId)
    .slice(0, opts.limit)
    .flatMap(p => {
      const log = readLog(p)
      if (!log) return []
      const id = path.basename(p, '.json')
      return [toSummary(log, id)]
    })
}

export function listFull(opts: { limit: number; jobId?: string }): GenerationLog[] {
  return listLogs(opts.jobId)
    .slice(0, opts.limit)
    .flatMap(p => {
      const log = readLog(p)
      return log ? [log] : []
    })
}

export function getLog(id: string): GenerationLog | null {
  const logPath = resolveLogPath(id)
  if (!logPath) return null
  if (!fs.existsSync(logPath)) return null
  return readLog(logPath)
}

export function deleteLog(id: string): boolean {
  const logPath = resolveLogPath(id)
  if (!logPath) return false
  if (!fs.existsSync(logPath)) return false
  fs.unlinkSync(logPath)
  return true
}

export function purgeAll(): number {
  const paths = listLogs()
  let deleted = 0
  for (const p of paths) {
    try { fs.unlinkSync(p); deleted++ } catch { /* ignore */ }
  }
  return deleted
}

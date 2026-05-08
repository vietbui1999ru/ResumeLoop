import fs from 'fs'
import path from 'path'

const LOG_DIR = path.join(process.cwd(), 'logs', 'generate')

export interface StageEntry {
  stage: string
  status: 'ok' | 'fail' | 'running'
  ts: string
  data: Record<string, unknown>
  stdout?: string
  stderr?: string
}

export interface GenerationLog {
  jobId: string
  company: string
  role_title: string
  started_at: string
  completed_at?: string
  outcome?: 'success' | 'failed'
  ai_decision?: Record<string, unknown>
  script_path?: string
  script_content?: string
  stages: StageEntry[]
}

export class GenerationLogger {
  private log: GenerationLog
  readonly logPath: string

  constructor(jobId: string, company: string, role_title: string) {
    fs.mkdirSync(LOG_DIR, { recursive: true })
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    this.logPath = path.join(LOG_DIR, `${jobId}__${ts}.json`)
    this.log = { jobId, company, role_title, started_at: new Date().toISOString(), stages: [] }
    this.flush()
  }

  stage(entry: Omit<StageEntry, 'ts'>) {
    // Replace existing entry for same stage+status=running, append otherwise
    const existing = this.log.stages.findIndex(s => s.stage === entry.stage && s.status === 'running')
    const full: StageEntry = { ...entry, ts: new Date().toISOString() }
    if (existing >= 0) this.log.stages[existing] = full
    else this.log.stages.push(full)
    this.flush()
  }

  setAIDecision(decision: Record<string, unknown>) {
    this.log.ai_decision = decision
    this.flush()
  }

  setScript(scriptPath: string, content: string) {
    this.log.script_path = scriptPath
    this.log.script_content = content
    this.flush()
  }

  finish(outcome: 'success' | 'failed') {
    this.log.outcome = outcome
    this.log.completed_at = new Date().toISOString()
    this.flush()
  }

  private flush() {
    fs.writeFileSync(this.logPath, JSON.stringify(this.log, null, 2), 'utf8')
  }
}

export function listLogs(jobId?: string): string[] {
  if (!fs.existsSync(LOG_DIR)) return []
  return fs.readdirSync(LOG_DIR)
    .filter(f => f.endsWith('.json') && (!jobId || f.startsWith(jobId + '__')))
    .sort()
    .reverse()
    .map(f => path.join(LOG_DIR, f))
}

export function readLog(logPath: string): GenerationLog | null {
  try {
    return JSON.parse(fs.readFileSync(logPath, 'utf8')) as GenerationLog
  } catch {
    return null
  }
}

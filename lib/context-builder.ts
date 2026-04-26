import fs from 'fs'
import path from 'path'
import { getDb } from './db'

type ContactInfo = { name: string; email: string; location: string; work_auth: string }
type EduEntry = { display: string }
type ExpEntry = { id: string; company: string }
type ProjEntry = { id: string; name: string }

export function buildSystemPrompt(): string {
  const claudeMd = fs.readFileSync(path.join(process.cwd(), 'CLAUDE.md'), 'utf8')
  const master = JSON.parse(
    fs.readFileSync(path.join(process.cwd(), 'pipeline', 'master_resume_data.json'), 'utf8')
  )

  const contact = master.contact as ContactInfo
  const profile = [
    `Candidate: ${contact.name}`,
    `Email: ${contact.email} | Location: ${contact.location}`,
    `Work auth: ${contact.work_auth}`,
    `Education: ${(master.education as EduEntry[]).map(e => e.display).join('; ')}`,
    `Projects: ${(master.projects as ProjEntry[]).map(p => `${p.id}(${p.name})`).join(', ')}`,
    `Work IDs: ${(master.experience as ExpEntry[]).map(e => `${e.id}(${e.company})`).join(', ')}`,
  ].join('\n')

  const db = getDb()
  const total = (db.prepare('SELECT COUNT(*) as n FROM jd_jobs').get() as { n: number }).n
  const kill = (db.prepare("SELECT COUNT(*) as n FROM jd_jobs WHERE visa_status='kill'").get() as { n: number }).n
  const pending = (db.prepare("SELECT COUNT(*) as n FROM jd_jobs WHERE tags LIKE '%un-resume%'").get() as { n: number }).n

  return [
    '# Resume Pipeline Context',
    '',
    '## Rules (CLAUDE.md excerpt)',
    claudeMd.slice(0, 3000),
    '',
    '## Candidate Profile',
    profile,
    '',
    '## Pipeline Stats',
    `Total JDs: ${total} | Visa-kill: ${kill} | Pending (un-resume): ${pending}`,
  ].join('\n')
}

export function buildSlashContext(command: string, args: string): string {
  const db = getDb()
  if (command === 'jobs') {
    const rows = db.prepare(
      `SELECT id, company, role_title, role_track, fit_pct, visa_status FROM jd_jobs WHERE role_track LIKE ? LIMIT 20`
    ).all(`%${args}%`)
    return `Jobs matching "${args}":\n${JSON.stringify(rows, null, 2)}`
  }
  if (command === 'stats') {
    const m = db.prepare('SELECT * FROM jd_metrics ORDER BY computed_at DESC LIMIT 1').get()
    return `Latest metrics:\n${JSON.stringify(m, null, 2)}`
  }
  if (command === 'resume') {
    const o = db.prepare('SELECT * FROM jd_outputs WHERE job_id = ?').get(args)
    return `Resume output for ${args}:\n${JSON.stringify(o, null, 2)}`
  }
  if (command === 'scan') {
    return 'Scan triggered — POST /api/batch/scan'
  }
  return ''
}

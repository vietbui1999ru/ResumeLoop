import { NextRequest } from 'next/server'
import { getAdapter } from '@/lib/db-adapter'
import { isCloud } from '@/lib/app-mode'
import fs from 'fs'
import path from 'path'

export const dynamic = 'force-dynamic'

function line(name: string, help: string, type: 'gauge' | 'counter', samples: string[]): string {
  return [`# HELP ${name} ${help}`, `# TYPE ${name} ${type}`, ...samples, ''].join('\n')
}

function gauge(name: string, value: number, labels?: Record<string, string>): string {
  const l = labels ? '{' + Object.entries(labels).map(([k, v]) => `${k}="${v}"`).join(',') + '}' : ''
  return `${name}${l} ${value}`
}

export async function GET(req: NextRequest) {
  // Token auth — checked before any DB work
  const token = process.env.METRICS_TOKEN
  if (token) {
    const auth   = req.headers.get('authorization') ?? ''
    const bearer = auth.startsWith('Bearer ') ? auth.slice(7) : ''
    const query  = req.nextUrl.searchParams.get('token') ?? ''
    if (bearer !== token && query !== token) {
      return new Response('Unauthorized', { status: 401 })
    }
  }

  const db     = await getAdapter()
  const mem    = process.memoryUsage()
  const parts: string[] = []

  // ── App health ──────────────────────────────────────────────────────────────

  parts.push(line('resumeloop_up', 'Always 1 — app is running', 'gauge',
    [gauge('resumeloop_up', 1)]))

  parts.push(line('resumeloop_uptime_seconds', 'Process uptime in seconds', 'gauge',
    [gauge('resumeloop_uptime_seconds', Math.floor(process.uptime()))]))

  // ── Node.js memory ──────────────────────────────────────────────────────────

  parts.push(line('resumeloop_nodejs_heap_used_bytes', 'V8 heap used', 'gauge',
    [gauge('resumeloop_nodejs_heap_used_bytes', mem.heapUsed)]))

  parts.push(line('resumeloop_nodejs_heap_total_bytes', 'V8 heap total allocated', 'gauge',
    [gauge('resumeloop_nodejs_heap_total_bytes', mem.heapTotal)]))

  parts.push(line('resumeloop_nodejs_rss_bytes', 'Resident set size', 'gauge',
    [gauge('resumeloop_nodejs_rss_bytes', mem.rss)]))

  // ── DB size (SQLite only — Neon Postgres manages its own storage) ────────────

  if (!isCloud()) {
    try {
      const dbPath = process.env.DB_PATH
        ? path.resolve(process.cwd(), process.env.DB_PATH)
        : path.join(process.cwd(), 'resume.db')
      const { size } = fs.statSync(dbPath)
      parts.push(line('resumeloop_db_size_bytes', 'SQLite database file size', 'gauge',
        [gauge('resumeloop_db_size_bytes', size)]))
    } catch { /* file not found — skip */ }
  }

  // ── Users ───────────────────────────────────────────────────────────────────

  // Use ISO timestamp arithmetic — compatible with both SQLite and Postgres.
  const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString()
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  const [realUsers, demoUsers, activeDemos] = await Promise.all([
    db.queryOne<{ n: number }>(`SELECT COUNT(*) as n FROM users WHERE is_demo = 0`),
    db.queryOne<{ n: number }>(`SELECT COUNT(*) as n FROM users WHERE is_demo = 1`),
    db.queryOne<{ n: number }>(
      `SELECT COUNT(*) as n FROM users WHERE is_demo = 1 AND created_at > ?`,
      [twelveHoursAgo],
    ),
  ])

  parts.push(line('resumeloop_users_total', 'Total registered users by type', 'gauge', [
    gauge('resumeloop_users_total', Number(realUsers?.n ?? 0), { type: 'real' }),
    gauge('resumeloop_users_total', Number(demoUsers?.n ?? 0), { type: 'demo' }),
  ]))

  parts.push(line('resumeloop_demo_users_active', 'Demo users with active 12h session', 'gauge',
    [gauge('resumeloop_demo_users_active', Number(activeDemos?.n ?? 0))]))

  // ── Jobs pipeline ───────────────────────────────────────────────────────────

  const [totalJobs, visaKill, jobsByAction, outputsTotal, outputsWithDocx] = await Promise.all([
    db.queryOne<{ n: number }>(`SELECT COUNT(*) as n FROM jd_jobs j JOIN users u ON j.user_id = u.id WHERE u.is_demo = 0`),
    db.queryOne<{ n: number }>(`SELECT COUNT(*) as n FROM jd_jobs WHERE visa_status = 'kill'`),
    db.query<{ action: string | null; n: number }>(
      `SELECT action, COUNT(*) as n FROM jd_jobs GROUP BY action`
    ),
    db.queryOne<{ n: number }>(`SELECT COUNT(*) as n FROM jd_outputs`),
    db.queryOne<{ n: number }>(`SELECT COUNT(*) as n FROM jd_outputs WHERE docx_path IS NOT NULL`),
  ])

  parts.push(line('resumeloop_jobs_total', 'Total job descriptions imported', 'gauge',
    [gauge('resumeloop_jobs_total', Number(totalJobs?.n ?? 0))]))

  parts.push(line('resumeloop_jobs_visa_killed_total', 'Jobs filtered due to visa requirements', 'gauge',
    [gauge('resumeloop_jobs_visa_killed_total', Number(visaKill?.n ?? 0))]))

  const stageMap: Record<string, string> = {
    '0-Saved':       'saved',
    '1-Applied':     'applied',
    '2-Phone Screen':'phone_screen',
    '3-Interview':   'interview',
    '4-Offer':       'offer',
    '5-Rejected':    'rejected',
  }
  const stageSamples = jobsByAction.map(r => {
    const stage = stageMap[r.action ?? '0-Saved'] ?? 'saved'
    return gauge('resumeloop_jobs_by_stage', Number(r.n), { stage })
  })
  if (stageSamples.length > 0) {
    parts.push(line('resumeloop_jobs_by_stage', 'Jobs grouped by pipeline stage', 'gauge', stageSamples))
  }

  parts.push(line('resumeloop_outputs_total', 'Total resume generation runs', 'counter',
    [gauge('resumeloop_outputs_total', Number(outputsTotal?.n ?? 0))]))

  parts.push(line('resumeloop_outputs_with_docx_total', 'Generation runs that produced a DOCX', 'counter',
    [gauge('resumeloop_outputs_with_docx_total', Number(outputsWithDocx?.n ?? 0))]))

  // ── AI spend ────────────────────────────────────────────────────────────────

  const [tokenRows, tokenRows24h] = await Promise.all([
    db.query<{ provider: string; feature: string; input: number; output: number }>(
      `SELECT provider, feature, SUM(input_tok) as input, SUM(output_tok) as output
       FROM ai_usage_log GROUP BY provider, feature`
    ),
    db.query<{ provider: string; feature: string; input: number; output: number }>(
      `SELECT provider, feature, SUM(input_tok) as input, SUM(output_tok) as output
       FROM ai_usage_log
       WHERE created_at > ?
       GROUP BY provider, feature`,
      [twentyFourHoursAgo],
    ),
  ])

  if (tokenRows.length > 0) {
    const inputSamples  = tokenRows.map(r => gauge('resumeloop_ai_tokens_total',  Number(r.input),  { provider: r.provider, feature: r.feature, direction: 'input'  }))
    const outputSamples = tokenRows.map(r => gauge('resumeloop_ai_tokens_total',  Number(r.output), { provider: r.provider, feature: r.feature, direction: 'output' }))
    parts.push(line('resumeloop_ai_tokens_total', 'Total AI tokens consumed all-time', 'counter',
      [...inputSamples, ...outputSamples]))
  }

  if (tokenRows24h.length > 0) {
    const inputSamples  = tokenRows24h.map(r => gauge('resumeloop_ai_tokens_24h', Number(r.input),  { provider: r.provider, feature: r.feature, direction: 'input'  }))
    const outputSamples = tokenRows24h.map(r => gauge('resumeloop_ai_tokens_24h', Number(r.output), { provider: r.provider, feature: r.feature, direction: 'output' }))
    parts.push(line('resumeloop_ai_tokens_24h', 'AI tokens consumed in last 24 hours', 'gauge',
      [...inputSamples, ...outputSamples]))
  }

  return new Response(parts.join('\n'), {
    headers: { 'Content-Type': 'text/plain; version=0.0.4; charset=utf-8' },
  })
}

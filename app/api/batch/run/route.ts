import { getDb } from '@/lib/db'
import { buildJob } from '@/lib/batch-worker'
import fs from 'fs'
import matter from 'gray-matter'
import pLimit from 'p-limit'
import crypto from 'crypto'

export const dynamic = 'force-dynamic'

type JobRow = {
  id: string; file_path: string; company: string; role_title: string
  tags: string; visa_status: string; role_track: string; fit_pct: number; raw_content: string
}

function tagJobFile(filePath: string): void {
  const raw = fs.readFileSync(filePath, 'utf8')
  const { data: fm, content } = matter(raw)
  const tags: string[] = Array.isArray(fm.tags) ? fm.tags : []
  const updated = tags.filter(t => t !== 'un-resume')
  if (!updated.includes('resume-ed')) updated.push('resume-ed')
  fm.tags = updated
  fs.writeFileSync(filePath, matter.stringify(content, fm))
}

export async function POST(req: Request) {
  const { job_ids }: { job_ids: string[] } = await req.json()
  if (!job_ids?.length) return new Response('job_ids required', { status: 400 })

  const db = getDb()
  const limit = pLimit(Number(process.env.BATCH_CONCURRENCY ?? 3))
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))

      const placeholders = job_ids.map(() => '?').join(',')
      const jobs = db.prepare(`SELECT * FROM jd_jobs WHERE id IN (${placeholders})`)
        .all(...job_ids) as JobRow[]

      const insertOutput = db.prepare(`
        INSERT INTO jd_outputs (id, job_id, docx_path, projects_used, work_ids_used, variant, tagline, built_at)
        VALUES (@id, @job_id, @docx_path, @projects_used, @work_ids_used, @variant, @tagline, CURRENT_TIMESTAMP)
      `)

      await Promise.all(jobs.map(job => limit(async () => {
        send({ job_id: job.id, status: 'running', message: `Building ${job.company} — ${job.role_title}` })
        try {
          const result = await buildJob(job)
          insertOutput.run({
            id: crypto.randomUUID(),
            job_id: job.id,
            docx_path: result.docx_path,
            projects_used: JSON.stringify(result.build_params.projects.map(p => p.id)),
            work_ids_used: JSON.stringify(result.build_params.work.map(w => w.id)),
            variant: result.variant,
            tagline: result.build_params.tagline,
          })
          tagJobFile(job.file_path)
          send({ job_id: job.id, status: 'done', message: `✓ ${result.docx_path}` })
        } catch (err) {
          send({ job_id: job.id, status: 'error', message: String(err instanceof Error ? err.message : err) })
        }
      })))

      send({ job_id: null, status: 'complete', message: `Done. ${jobs.length} jobs processed.` })
      controller.close()
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  })
}

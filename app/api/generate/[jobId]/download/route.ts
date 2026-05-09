import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { getSetting } from '@/lib/settings'
import fs from 'fs'
import path from 'path'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params

  const output = getDb().prepare(
    'SELECT docx_path FROM jd_outputs WHERE job_id = ? ORDER BY built_at DESC LIMIT 1'
  ).get(jobId) as { docx_path: string } | undefined

  if (!output?.docx_path) {
    return NextResponse.json({ error: 'No output found for this job' }, { status: 404 })
  }

  const resolvedDocx = path.resolve(output.docx_path)
  const cwd = process.cwd()
  const outputDir = path.resolve(getSetting('output_path'))
  const inCwd = resolvedDocx.startsWith(cwd + path.sep)
  const inOutputDir = resolvedDocx.startsWith(outputDir + path.sep)
  if (!inCwd && !inOutputDir) {
    return NextResponse.json({ error: 'Invalid path' }, { status: 403 })
  }

  if (!fs.existsSync(resolvedDocx)) {
    return NextResponse.json({ error: 'DOCX file not found on disk' }, { status: 404 })
  }

  const buf      = fs.readFileSync(resolvedDocx)
  const filename = path.basename(resolvedDocx)

  return new Response(buf, {
    headers: {
      'Content-Type':        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}

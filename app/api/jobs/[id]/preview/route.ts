import fs from 'fs'
import path from 'path'
import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { getSetting } from '@/lib/settings'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const row = getDb().prepare(
    'SELECT pdf_path FROM jd_outputs WHERE job_id = ? ORDER BY built_at DESC LIMIT 1'
  ).get(id) as { pdf_path: string | null } | undefined

  if (!row?.pdf_path) {
    return NextResponse.json({ error: 'PDF not available' }, { status: 404 })
  }

  const resolvedPdf = path.resolve(row.pdf_path)
  const cwd = process.cwd()
  const outputDir = path.resolve(getSetting('output_path'))
  const inCwd = resolvedPdf.startsWith(cwd + path.sep)
  const inOutputDir = resolvedPdf.startsWith(outputDir + path.sep)
  if (!inCwd && !inOutputDir) {
    return NextResponse.json({ error: 'Invalid path' }, { status: 403 })
  }
  if (!resolvedPdf.endsWith('.pdf')) {
    return NextResponse.json({ error: 'Not a PDF file' }, { status: 400 })
  }

  if (!fs.existsSync(resolvedPdf)) {
    return NextResponse.json({ error: 'PDF file missing on disk' }, { status: 404 })
  }

  const pdf = fs.readFileSync(resolvedPdf)
  return new Response(pdf, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${path.basename(resolvedPdf)}"`,
    },
  })
}

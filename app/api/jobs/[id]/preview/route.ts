import fs from 'fs'
import path from 'path'
import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const row = getDb().prepare(
    'SELECT pdf_path FROM jd_outputs WHERE job_id = ? ORDER BY built_at DESC LIMIT 1'
  ).get(id) as { pdf_path: string | null } | undefined

  if (!row?.pdf_path) {
    return NextResponse.json({ error: 'PDF not available' }, { status: 404 })
  }

  if (!fs.existsSync(row.pdf_path)) {
    return NextResponse.json({ error: 'PDF file missing on disk' }, { status: 404 })
  }

  const pdf = fs.readFileSync(row.pdf_path)
  return new Response(pdf, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${path.basename(row.pdf_path)}"`,
    },
  })
}

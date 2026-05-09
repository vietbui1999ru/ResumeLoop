import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const row = getDb().prepare(`
    SELECT id, job_id, docx_path, pdf_path, projects_used, work_ids_used,
           variant, tagline, reasoning, built_at
    FROM jd_outputs
    WHERE job_id = ?
    ORDER BY built_at DESC
    LIMIT 1
  `).get(params.id)

  if (!row) return NextResponse.json({ error: 'No output found' }, { status: 404 })
  return NextResponse.json(row)
}

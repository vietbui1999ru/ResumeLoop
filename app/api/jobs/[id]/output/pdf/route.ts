import fs from 'fs'
import os from 'os'
import path from 'path'
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { getAdapter } from '@/lib/db-adapter'
import { isS3Key, getPresignedUrl } from '@/lib/storage'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = session.user.id

  const { id } = await params
  const db = await getAdapter()
  const row = await db.queryOne<{ pdf_path: string | null }>(
    'SELECT pdf_path FROM jd_outputs WHERE job_id = ? AND user_id = ? ORDER BY built_at DESC LIMIT 1',
    [id, userId],
  )

  if (!row?.pdf_path) {
    return NextResponse.json({ error: 'PDF not available' }, { status: 404 })
  }

  if (isS3Key(row.pdf_path)) {
    const url = await getPresignedUrl(row.pdf_path)
    if (!url) return NextResponse.json({ error: 'Could not generate preview URL' }, { status: 500 })
    // Proxy bytes through server — browser fetch() cannot follow cross-origin S3 redirects (CORS)
    const s3Res = await fetch(url)
    if (!s3Res.ok) return NextResponse.json({ error: 'Could not fetch PDF from storage' }, { status: 502 })
    return new Response(s3Res.body, {
      headers: {
        'Content-Type':        'application/pdf',
        'Content-Disposition': 'inline; filename="resume.pdf"',
        'Cache-Control':       'private, max-age=300',
      },
    })
  }

  if (!row.pdf_path.endsWith('.pdf')) {
    return NextResponse.json({ error: 'Not a PDF file' }, { status: 400 })
  }

  let resolvedPdf: string
  try {
    resolvedPdf = fs.realpathSync(row.pdf_path)
  } catch {
    return NextResponse.json({ error: 'PDF file missing on disk' }, { status: 404 })
  }

  const home = os.homedir()
  const safeRoots = [
    path.join(home, 'Desktop'),
    path.join(home, 'Documents'),
    path.join(home, 'Downloads'),
    process.cwd(),
  ].map(r => { try { return fs.realpathSync(r) } catch { return r } })
  const isSafe = safeRoots.some(r => resolvedPdf.startsWith(r + path.sep) || resolvedPdf === r)
  if (!isSafe) {
    return NextResponse.json({ error: 'Invalid path' }, { status: 403 })
  }

  const pdf = fs.readFileSync(resolvedPdf)
  return new Response(pdf, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${path.basename(resolvedPdf)}"`,
    },
  })
}

/**
 * On-demand DOCX→PDF conversion has been removed (ADR 0001 §5): it relied on
 * LibreOffice, which is gone. PDFs are now rendered from resume data at
 * generation time (Playwright HTML→PDF), so every new generation already has a
 * .pdf. Regenerate the resume to produce one for older outputs.
 */
export async function POST() {
  return NextResponse.json(
    { error: 'On-demand PDF conversion was removed. PDFs are generated automatically — regenerate the resume.' },
    { status: 410 },
  )
}

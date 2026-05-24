import fs from 'fs'
import os from 'os'
import path from 'path'
import { spawn } from 'child_process'
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

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = session.user.id

  const { id } = await params
  const db = await getAdapter()
  const row = await db.queryOne<{ id: string; docx_path: string | null; pdf_path: string | null }>(
    'SELECT id, docx_path, pdf_path FROM jd_outputs WHERE job_id = ? AND user_id = ? ORDER BY built_at DESC LIMIT 1',
    [id, userId],
  )

  if (!row?.docx_path) return NextResponse.json({ error: 'No DOCX to convert' }, { status: 400 })
  if (row.pdf_path)    return NextResponse.json({ error: 'PDF already exists' }, { status: 409 })
  if (isS3Key(row.docx_path)) return NextResponse.json({ error: 'On-demand PDF not supported for cloud storage' }, { status: 400 })

  if (!row.docx_path.endsWith('.docx')) {
    return NextResponse.json({ error: 'Invalid file type' }, { status: 400 })
  }

  let resolvedDocx: string
  try {
    resolvedDocx = fs.realpathSync(row.docx_path)
  } catch {
    return NextResponse.json({ error: 'DOCX file missing on disk' }, { status: 404 })
  }

  const home = os.homedir()
  const safeRoots = [
    path.join(home, 'Desktop'),
    path.join(home, 'Documents'),
    path.join(home, 'Downloads'),
    process.cwd(),
  ].map(r => { try { return fs.realpathSync(r) } catch { return r } })
  const isSafe = safeRoots.some(r => resolvedDocx.startsWith(r + path.sep) || resolvedDocx === r)
  if (!isSafe) {
    return NextResponse.json({ error: 'Invalid path' }, { status: 403 })
  }

  const pdfPath = resolvedDocx.slice(0, -5) + '.pdf'
  const toPdfScript = path.join(process.cwd(), 'harness', 'to-pdf.js')

  try {
    await new Promise<void>((resolve, reject) => {
      const proc = spawn('node', [toPdfScript, resolvedDocx, pdfPath], { cwd: process.cwd() })
      proc.on('close', code => code === 0 ? resolve() : reject(new Error(`to-pdf.js exited with code ${code}`)))
      proc.on('error', reject)
    })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }

  await db.run('UPDATE jd_outputs SET pdf_path = ? WHERE id = ?', [pdfPath, row.id])
  return NextResponse.json({ pdf_path: pdfPath })
}

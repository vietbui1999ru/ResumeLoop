import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { getAdapter } from '@/lib/db-adapter'
import { isS3Key, getPresignedUrl } from '@/lib/storage'
import fs from 'fs'
import os from 'os'
import path from 'path'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = session.user.id

  const { jobId } = await params

  const db = await getAdapter()
  const output = await db.queryOne<{ docx_path: string }>(
    'SELECT docx_path FROM jd_outputs WHERE job_id = ? AND user_id = ? ORDER BY built_at DESC LIMIT 1',
    [jobId, userId],
  )

  if (!output?.docx_path) {
    return NextResponse.json({ error: 'No output found for this job' }, { status: 404 })
  }

  if (isS3Key(output.docx_path)) {
    const url = await getPresignedUrl(output.docx_path)
    if (!url) return NextResponse.json({ error: 'Could not generate download URL' }, { status: 500 })
    return NextResponse.redirect(url)
  }

  let resolvedDocx: string
  try {
    resolvedDocx = fs.realpathSync(output.docx_path)
  } catch {
    return NextResponse.json({ error: 'DOCX file not found on disk' }, { status: 404 })
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

  const buf      = fs.readFileSync(resolvedDocx)
  const filename = path.basename(resolvedDocx)

  return new Response(buf, {
    headers: {
      'Content-Type':        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}

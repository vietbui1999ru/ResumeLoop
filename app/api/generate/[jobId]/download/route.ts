import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { getAdapter } from '@/lib/db-adapter'
import { isS3Key, getPresignedUrl } from '@/lib/storage'
import { getSetting } from '@/lib/settings'
import fs from 'fs'
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

  if (!resolvedDocx.endsWith('.docx')) {
    return NextResponse.json({ error: 'Invalid path' }, { status: 403 })
  }

  // Allow the configured output dir + the in-process build dir under cwd
  const outputPath = await getSetting('output_path').catch(() => null)
  const safeRoots = [process.cwd()]
  if (outputPath) safeRoots.push(outputPath)
  const resolvedRoots = safeRoots.map(r => { try { return fs.realpathSync(r) } catch { return r } })
  const isSafe = resolvedRoots.some(r => resolvedDocx.startsWith(r + path.sep))
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

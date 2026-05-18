import fs from 'fs'
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { getAdapter } from '@/lib/db-adapter'
import { getPresignedUrl, isS3Key } from '@/lib/storage'

type Format = 'docx' | 'pdf'

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = session.user.id

  const { id } = await params
  const format: Format = new URL(req.url).searchParams.get('format') === 'pdf' ? 'pdf' : 'docx'

  const db  = await getAdapter()
  const row = await db.queryOne<{ docx_path: string; pdf_path: string | null }>(
    `SELECT docx_path, pdf_path FROM jd_outputs
     WHERE job_id = ? AND user_id = ?
     ORDER BY built_at DESC LIMIT 1`,
    [id, userId],
  )

  if (!row) return NextResponse.json({ error: 'No output found' }, { status: 404 })

  const filePath = format === 'pdf' ? row.pdf_path : row.docx_path

  if (!filePath) {
    return NextResponse.json(
      { error: format === 'pdf' ? 'PDF not available for this output' : 'DOCX path missing' },
      { status: 404 },
    )
  }

  // Cloud path: redirect to presigned S3 URL
  if (isS3Key(filePath)) {
    const url = await getPresignedUrl(filePath, 300) // 5-min expiry
    if (!url) return NextResponse.json({ error: 'Could not generate download URL' }, { status: 500 })
    return NextResponse.redirect(url)
  }

  // Local path: stream file bytes
  if (!fs.existsSync(filePath)) {
    return NextResponse.json({ error: 'File not found on disk' }, { status: 404 })
  }

  const buf      = fs.readFileSync(filePath)
  const filename = encodeURIComponent(filePath.split('/').at(-1) ?? `resume.${format}`)
  const mime     = format === 'pdf' ? 'application/pdf'
                                    : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

  return new NextResponse(buf, {
    headers: {
      'Content-Type':        mime,
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length':      String(buf.length),
    },
  })
}

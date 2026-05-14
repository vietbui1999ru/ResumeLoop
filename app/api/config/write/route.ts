import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { checkNodeSyntax } from '@/lib/run-script'
import { PATHS } from '@/lib/paths'
import fs from 'fs'
import os from 'os'
import path from 'path'

// buildv2.js is excluded — it is executed by node and must not be writable via HTTP
const ALLOWED: Record<string, string> = {
  'master_resume_data.json':           PATHS.pipeline.masterData,
  'ats-optimized-resume-system.md':    PATHS.docs.atsSystem,
  'ats-optimization-guidelines.md':    PATHS.docs.atsGuidelines,
  'CLAUDE-full.md':                    PATHS.docs.claudeFull,
  'spec-job-match-resume-generator.md': PATHS.docs.spec,
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { file, content }: { file: string; content: string } = await req.json()
  if (!file || !Object.prototype.hasOwnProperty.call(ALLOWED, file)) {
    return NextResponse.json({ error: 'Unknown file' }, { status: 400 })
  }
  if (typeof content !== 'string' || content.length > 5 * 1024 * 1024) {
    return NextResponse.json({ error: 'Content too large (max 5 MB)' }, { status: 400 })
  }

  if (file.endsWith('.json')) {
    try { JSON.parse(content) } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
  }

  if (file.endsWith('.js')) {
    const tmp = path.join(os.tmpdir(), `syntax-check-${Date.now()}.js`)
    fs.writeFileSync(tmp, content)
    const result = await checkNodeSyntax(tmp)
    fs.unlinkSync(tmp)
    if (result.code !== 0) {
      return NextResponse.json({ error: `Syntax error: ${result.stderr}` }, { status: 400 })
    }
  }

  const target = ALLOWED[file]
  if (fs.existsSync(target)) {
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    fs.copyFileSync(target, `${target}.${ts}.bak`)
  }
  fs.writeFileSync(target, content, 'utf8')

  return NextResponse.json({ ok: true })
}

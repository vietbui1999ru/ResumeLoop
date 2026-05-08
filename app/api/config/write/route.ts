import { NextResponse } from 'next/server'
import { checkNodeSyntax } from '@/lib/run-script'
import { PATHS } from '@/lib/paths'
import fs from 'fs'
import os from 'os'
import path from 'path'

const ALLOWED: Record<string, string> = {
  'buildv2.js':                        PATHS.pipeline.builder,
  'master_resume_data.json':           PATHS.pipeline.masterData,
  'ats-optimized-resume-system.md':    PATHS.docs.atsSystem,
  'ats-optimization-guidelines.md':    PATHS.docs.atsGuidelines,
  'CLAUDE-full.md':                    PATHS.docs.claudeFull,
  'spec-job-match-resume-generator.md': PATHS.docs.spec,
}

export async function POST(req: Request) {
  const { file, content }: { file: string; content: string } = await req.json()
  if (!file || !ALLOWED[file]) return NextResponse.json({ error: 'Unknown file' }, { status: 400 })

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
  const backup = target + '.bak'
  if (fs.existsSync(target)) fs.copyFileSync(target, backup)
  fs.writeFileSync(target, content, 'utf8')

  return NextResponse.json({ ok: true, backup })
}

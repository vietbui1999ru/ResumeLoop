import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import { PATHS } from '@/lib/paths'

const ALLOWED: Record<string, string> = {
  'buildv2.js':                        PATHS.pipeline.builder,
  'master_resume_data.json':           PATHS.pipeline.masterData,
  'ats-optimized-resume-system.md':    PATHS.docs.atsSystem,
  'ats-optimization-guidelines.md':    PATHS.docs.atsGuidelines,
  'CLAUDE-full.md':                    PATHS.docs.claudeFull,
  'spec-job-match-resume-generator.md': PATHS.docs.spec,
}

export async function GET(req: NextRequest) {
  const file = req.nextUrl.searchParams.get('file')
  if (!file || !ALLOWED[file]) return NextResponse.json({ error: 'Unknown file' }, { status: 400 })
  return NextResponse.json({ content: fs.readFileSync(ALLOWED[file], 'utf8') })
}

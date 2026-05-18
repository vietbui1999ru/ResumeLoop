import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import { auth } from '@/lib/auth'
import { PATHS } from '@/lib/paths'

// buildv2.js is a server-executed script — never expose via HTTP read.
// Proprietary prompt files are stored in system_prompts DB — never exposed via this route.
const ALLOWED: Record<string, string> = {
  'master_resume_data.json': PATHS.pipeline.masterData,
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const file = req.nextUrl.searchParams.get('file')
  if (!file || !Object.prototype.hasOwnProperty.call(ALLOWED, file)) {
    return NextResponse.json({ error: 'Unknown file' }, { status: 400 })
  }
  return NextResponse.json({ content: fs.readFileSync(ALLOWED[file], 'utf8') })
}

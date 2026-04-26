import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

const ALLOWED: Record<string, string> = {
  'buildv2.js':               path.join(process.cwd(), 'pipeline', 'buildv2.js'),
  'master_resume_data.json':  path.join(process.cwd(), 'pipeline', 'master_resume_data.json'),
}

export async function GET(req: NextRequest) {
  const file = req.nextUrl.searchParams.get('file')
  if (!file || !ALLOWED[file]) return NextResponse.json({ error: 'Unknown file' }, { status: 400 })
  return NextResponse.json({ content: fs.readFileSync(ALLOWED[file], 'utf8') })
}

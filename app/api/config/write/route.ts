import { NextResponse } from 'next/server'
import { checkNodeSyntax } from '@/lib/run-script'
import fs from 'fs'
import path from 'path'
import os from 'os'

const ALLOWED: Record<string, string> = {
  'buildv2.js':               path.join(process.cwd(), 'pipeline', 'buildv2.js'),
  'master_resume_data.json':  path.join(process.cwd(), 'pipeline', 'master_resume_data.json'),
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

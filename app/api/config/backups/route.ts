import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import { auth } from '@/lib/auth'
import { PATHS } from '@/lib/paths'

const ALLOWED: Record<string, string> = {
  'master_resume_data.json':            PATHS.pipeline.masterData,
  'ats-optimized-resume-system.md':     PATHS.docs.atsSystem,
  'ats-optimization-guidelines.md':     PATHS.docs.atsGuidelines,
  'CLAUDE-full.md':                     PATHS.docs.claudeFull,
  'spec-job-match-resume-generator.md': PATHS.docs.spec,
}

function listBackups(filePath: string) {
  const dir = path.dirname(filePath)
  const prefix = path.basename(filePath) + '.'
  return fs.readdirSync(dir)
    .filter(f => f.startsWith(prefix) && f.endsWith('.bak'))
    .map(f => {
      const ts = f.slice(prefix.length, -4) // strip prefix and ".bak"
      return { name: f, ts }
    })
    .sort((a, b) => b.name.localeCompare(a.name)) // newest first
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const file = req.nextUrl.searchParams.get('file')
  const bakName = req.nextUrl.searchParams.get('name')
  if (!file || !Object.prototype.hasOwnProperty.call(ALLOWED, file)) {
    return NextResponse.json({ error: 'Unknown file' }, { status: 400 })
  }

  const filePath = ALLOWED[file]
  const dir = path.dirname(filePath)
  const base = path.basename(filePath)

  if (bakName) {
    // Security: backup name must belong to this file
    if (!bakName.startsWith(base + '.') || !bakName.endsWith('.bak') || bakName.includes('/') || bakName.includes('..')) {
      return NextResponse.json({ error: 'Invalid backup name' }, { status: 400 })
    }
    const bakPath = path.join(dir, bakName)
    if (!fs.existsSync(bakPath)) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json({ content: fs.readFileSync(bakPath, 'utf8') })
  }

  return NextResponse.json({ backups: listBackups(filePath) })
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json() as { file?: string; name?: string }
  const { file, name } = body
  if (!file || !Object.prototype.hasOwnProperty.call(ALLOWED, file)) {
    return NextResponse.json({ error: 'Unknown file' }, { status: 400 })
  }

  const filePath = ALLOWED[file]
  const dir = path.dirname(filePath)
  const base = path.basename(filePath)

  if (!name || !name.startsWith(base + '.') || !name.endsWith('.bak') || name.includes('/') || name.includes('..')) {
    return NextResponse.json({ error: 'Invalid backup name' }, { status: 400 })
  }
  const bakPath = path.join(dir, name)
  if (!fs.existsSync(bakPath)) return NextResponse.json({ error: 'Backup not found' }, { status: 404 })

  // Snapshot current before overwriting
  if (fs.existsSync(filePath)) {
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    fs.copyFileSync(filePath, `${filePath}.${ts}.bak`)
  }
  fs.copyFileSync(bakPath, filePath)
  return NextResponse.json({ ok: true })
}

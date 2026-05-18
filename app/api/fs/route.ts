import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { auth } from '@/lib/auth'
import { validateSafeDir } from '@/lib/settings'

function safePath(p: string): string {
  if (p.startsWith('~/')) p = path.join(os.homedir(), p.slice(2))
  return path.resolve(p)
}

// GET /api/fs?path=/some/dir  — list subdirectories + file counts
export async function GET(req: Request) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(req.url)
  const raw = url.searchParams.get('path') ?? os.homedir()

  let dir: string
  try {
    dir = validateSafeDir(safePath(raw))
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 })
  }

  if (!fs.existsSync(dir)) {
    return NextResponse.json({ error: 'Path does not exist', path: dir }, { status: 404 })
  }

  const stat = fs.statSync(dir)
  if (!stat.isDirectory()) {
    return NextResponse.json({ error: 'Not a directory', path: dir }, { status: 400 })
  }

  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return NextResponse.json({ error: 'Permission denied', path: dir }, { status: 403 })
  }

  const dirs = entries
    .filter(e => e.isDirectory() && !e.name.startsWith('.'))
    .map(e => e.name)
    .sort()

  const mdFiles   = entries.filter(e => e.isFile() && e.name.endsWith('.md')).map(e => e.name).sort()
  const docxCount = entries.filter(e => e.isFile() && e.name.endsWith('.docx')).length

  return NextResponse.json({
    path: dir,
    parent: path.dirname(dir),
    dirs,
    files: mdFiles,
    md_count: mdFiles.length,
    docx_count: docxCount,
  })
}

// POST /api/fs  { path: '/some/new/dir' }  — create directory (safe roots only)
export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { path: rawPath }: { path: string } = await req.json()
  if (!rawPath?.trim()) return NextResponse.json({ error: 'path required' }, { status: 400 })

  let dir: string
  try {
    dir = validateSafeDir(rawPath.trim())
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 })
  }

  try {
    fs.mkdirSync(dir, { recursive: true })
    return NextResponse.json({ ok: true, path: dir })
  } catch {
    return NextResponse.json({ error: 'Failed to create directory' }, { status: 500 })
  }
}

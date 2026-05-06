import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import os from 'os'

function safePath(p: string): string {
  // Resolve ~
  if (p.startsWith('~/')) p = path.join(os.homedir(), p.slice(2))
  return path.resolve(p)
}

// GET /api/fs?path=/some/dir  — list subdirectories + file counts
export async function GET(req: Request) {
  const url = new URL(req.url)
  const raw = url.searchParams.get('path') ?? os.homedir()
  const dir = safePath(raw)

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

  const mdCount  = entries.filter(e => e.isFile() && e.name.endsWith('.md')).length
  const docxCount = entries.filter(e => e.isFile() && e.name.endsWith('.docx')).length

  return NextResponse.json({
    path: dir,
    parent: path.dirname(dir),
    dirs,
    md_count: mdCount,
    docx_count: docxCount,
  })
}

// POST /api/fs  { path: '/some/new/dir' }  — create directory
export async function POST(req: Request) {
  const { path: rawPath }: { path: string } = await req.json()
  if (!rawPath?.trim()) return NextResponse.json({ error: 'path required' }, { status: 400 })

  const dir = safePath(rawPath.trim())
  try {
    fs.mkdirSync(dir, { recursive: true })
    return NextResponse.json({ ok: true, path: dir })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

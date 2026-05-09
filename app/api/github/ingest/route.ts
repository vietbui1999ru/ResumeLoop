import { NextResponse } from 'next/server'
import { parseGithubUrl, summarizeRepo } from '@/lib/github-ingest'

export async function POST(req: Request) {
  const { url } = await req.json() as { url?: string }
  if (!url) return NextResponse.json({ error: 'url required' }, { status: 400 })

  const parsed = parseGithubUrl(url)
  if (!parsed) return NextResponse.json({ error: 'Invalid GitHub URL' }, { status: 400 })

  try {
    const entry = await summarizeRepo(parsed.owner, parsed.repo)
    return NextResponse.json(entry)
  } catch (e) {
    const msg = String(e)
    if (msg.includes('404')) return NextResponse.json({ error: 'Repo not found or private' }, { status: 404 })
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

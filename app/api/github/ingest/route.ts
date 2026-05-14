import { NextResponse } from 'next/server'
import { parseGithubUrl, summarizeRepo } from '@/lib/github-ingest'
import { auth } from '@/lib/auth'

const URL_MAX_LEN = 300

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = session.user.id

  const body = await req.json() as { url?: unknown }
  const url = typeof body.url === 'string' ? body.url.trim() : ''
  if (!url) return NextResponse.json({ error: 'url required' }, { status: 400 })
  if (url.length > URL_MAX_LEN) return NextResponse.json({ error: `URL too long (max ${URL_MAX_LEN} chars)` }, { status: 400 })

  const parsed = parseGithubUrl(url)
  if (!parsed) return NextResponse.json({ error: 'Invalid GitHub URL' }, { status: 400 })

  try {
    const entry = await summarizeRepo(parsed.owner, parsed.repo, userId)
    return NextResponse.json(entry)
  } catch (e) {
    const msg = String(e)
    if (msg.includes('404')) return NextResponse.json({ error: 'Repo not found or private' }, { status: 404 })
    return NextResponse.json({ error: 'Failed to fetch repository' }, { status: 500 })
  }
}

import { NextResponse }    from 'next/server'
import { auth }            from '@/lib/auth'
import { listIngestionSources, deleteIngestionSource } from '@/lib/ingest/db'

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const sources = await listIngestionSources(session.user.id)
  return NextResponse.json({ sources })
}

export async function DELETE(req: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const id = new URL(req.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const deleted = await deleteIngestionSource(id, session.user.id)
  if (!deleted) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ ok: true })
}

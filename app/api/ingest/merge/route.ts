import { NextResponse }          from 'next/server'
import { auth }                  from '@/lib/auth'
import { listIngestionSources }  from '@/lib/ingest/db'
import { mergePartials }         from '@/lib/ingest/merge'

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = session.user.id

  const sources     = await listIngestionSources(userId)
  const doneSources = sources.filter(s => s.status === 'done')

  if (doneSources.length === 0)
    return NextResponse.json({ error: 'No completed sources to merge' }, { status: 422 })

  try {
    const mergeResult = await mergePartials(doneSources, userId)
    return NextResponse.json(mergeResult)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 422 })
  }
}

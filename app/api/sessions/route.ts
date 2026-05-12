import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { listSessions, createSession } from '@/lib/sessions'

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return NextResponse.json(await listSessions(session.user.id))
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = (await req.json()) as { name?: string }
  if (!body.name) return NextResponse.json({ error: 'name required' }, { status: 400 })
  const created = await createSession(body.name, session.user.id)
  return NextResponse.json(created, { status: 201 })
}

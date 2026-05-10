import { NextResponse } from 'next/server'
import { listSessions, createSession } from '@/lib/sessions'

export async function GET() {
  return NextResponse.json(listSessions())
}

export async function POST(req: Request) {
  const body = (await req.json()) as { name?: string }
  if (!body.name) return NextResponse.json({ error: 'name required' }, { status: 400 })
  const session = createSession(body.name)
  return NextResponse.json(session, { status: 201 })
}

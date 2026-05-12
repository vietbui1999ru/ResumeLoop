import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { getSession, renameSession, deleteSession } from '@/lib/sessions'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth_session = await auth()
  if (!auth_session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = auth_session.user.id

  const { id } = await params
  const session = await getSession(id, userId)
  if (!session) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(session)
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth_session = await auth()
  if (!auth_session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = auth_session.user.id

  const { id } = await params
  const body = (await req.json()) as { name?: string }
  if (!body.name) return NextResponse.json({ error: 'name required' }, { status: 400 })
  const existing = await getSession(id, userId)
  if (!existing) return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  try {
    await renameSession(id, body.name, userId)
  } catch (e) {
    const msg = String(e)
    if (msg.includes('Cannot rename default')) return NextResponse.json({ error: msg }, { status: 403 })
    throw e
  }
  return NextResponse.json({ ok: true })
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth_session = await auth()
  if (!auth_session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = auth_session.user.id

  const { id } = await params
  const existing = await getSession(id, userId)
  if (!existing) return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  try {
    await deleteSession(id, userId)
  } catch (e) {
    const msg = String(e)
    if (msg.includes('Cannot delete default')) return NextResponse.json({ error: msg }, { status: 403 })
    throw e
  }
  return NextResponse.json({ ok: true })
}

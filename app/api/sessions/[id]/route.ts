import { NextResponse } from 'next/server'
import { getSession, renameSession, deleteSession } from '@/lib/sessions'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const session = getSession(id)
  if (!session) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(session)
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = (await req.json()) as { name?: string }
  if (!body.name) return NextResponse.json({ error: 'name required' }, { status: 400 })
  try {
    renameSession(id, body.name)
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
  const { id } = await params
  try {
    deleteSession(id)
  } catch (e) {
    const msg = String(e)
    if (msg.includes('Cannot delete default')) return NextResponse.json({ error: msg }, { status: 403 })
    throw e
  }
  return NextResponse.json({ ok: true })
}

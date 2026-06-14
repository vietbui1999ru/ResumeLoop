import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { getOutreachItem, updateOutreachItem, deleteOutreachItem } from '@/lib/outreach'
import { OutreachPatchInputSchema } from '@/lib/schemas/outreach'

type Params = { params: Promise<{ id: string; itemId: string }> }

export async function PATCH(req: Request, { params }: Params) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = session.user.id
  const { id: jobId, itemId } = await params

  const bodyParse = OutreachPatchInputSchema.safeParse(await req.json())
  if (!bodyParse.success) {
    const message = bodyParse.error.errors[0]?.message ?? 'Invalid request body'
    return NextResponse.json({ error: message }, { status: 400 })
  }

  const updated = await updateOutreachItem(itemId, jobId, userId, bodyParse.data)
  if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(updated)
}

export async function DELETE(_req: Request, { params }: Params) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = session.user.id
  const { id: jobId, itemId } = await params

  const ok = await deleteOutreachItem(itemId, jobId, userId)
  if (!ok) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ ok: true })
}

export async function GET(_req: Request, { params }: Params) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = session.user.id
  const { id: jobId, itemId } = await params

  const item = await getOutreachItem(itemId, jobId, userId)
  if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(item)
}

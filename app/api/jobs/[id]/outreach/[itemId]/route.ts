import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { getOutreachItem, updateOutreachItem, deleteOutreachItem } from '@/lib/outreach'
import type { OutreachItem, OutreachStatus } from '@/lib/outreach'

type Params = { params: Promise<{ id: string; itemId: string }> }

const VALID_STATUSES: OutreachStatus[] = ['not_contacted', 'drafted', 'sent', 'replied']
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function PATCH(req: Request, { params }: Params) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = session.user.id
  const { id: jobId, itemId } = await params

  const body: Partial<Pick<OutreachItem, 'role' | 'role_custom' | 'notes' | 'email' | 'status' | 'linkedin_draft' | 'email_draft'>> = await req.json()

  if ('status' in body && body.status !== undefined && !VALID_STATUSES.includes(body.status)) {
    return NextResponse.json({ error: `status must be one of: ${VALID_STATUSES.join(', ')}` }, { status: 400 })
  }
  if ('email' in body && body.email && !EMAIL_RE.test(body.email)) {
    return NextResponse.json({ error: 'Invalid email format' }, { status: 400 })
  }

  const updated = await updateOutreachItem(itemId, jobId, userId, body)
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

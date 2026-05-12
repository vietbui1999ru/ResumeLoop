import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { promoteSession } from '@/lib/sessions'

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  try {
    await promoteSession(id, session.user.id)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 400 })
  }
  return NextResponse.json({ ok: true })
}

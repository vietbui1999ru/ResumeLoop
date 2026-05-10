import { NextResponse } from 'next/server'
import { promoteSession } from '@/lib/sessions'

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    promoteSession(id)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 400 })
  }
  return NextResponse.json({ ok: true })
}

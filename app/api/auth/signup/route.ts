import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { randomUUID } from 'crypto'
import { getAdapter } from '@/lib/db-adapter'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function POST(req: Request) {
  let body: { email?: string; password?: string }
  try {
    body = await req.json() as { email?: string; password?: string }
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const email    = body.email?.trim().toLowerCase() ?? ''
  const password = body.password ?? ''

  if (!EMAIL_RE.test(email))        return NextResponse.json({ error: 'Invalid email' },                { status: 400 })
  if (password.length < 8)          return NextResponse.json({ error: 'Password must be ≥8 characters' }, { status: 400 })
  if (password.length > 128)        return NextResponse.json({ error: 'Password too long' },            { status: 400 })
  if (email === 'demo@demo.com')     return NextResponse.json({ error: 'That email is reserved' },      { status: 400 })

  const hash = await bcrypt.hash(password, 12)
  try {
    const db = await getAdapter()
    await db.run(
      `INSERT INTO users (id, email, password) VALUES (?, ?, ?)`,
      [randomUUID(), email, hash],
    )
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Email already registered' }, { status: 409 })
  }
}

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { listProviders, setActiveProviderId } from '@/lib/providers/active-provider'

// Needs fs + child_process (CLI detection) — must run in the Node runtime, not edge.
export const runtime = 'nodejs'

/** GET /api/providers — list every registered brain with install + active state. */
export async function GET() {
  return NextResponse.json({ providers: await listProviders() })
}

const PostSchema = z.object({ providerId: z.string().min(1) })

/** POST /api/providers { providerId } — set the active brain (persisted locally). */
export async function POST(req: Request) {
  const parsed = PostSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'providerId is required' }, { status: 400 })
  }
  try {
    setActiveProviderId(parsed.data.providerId)
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 })
  }
  return NextResponse.json({ providers: await listProviders() })
}

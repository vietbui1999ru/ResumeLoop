import { NextResponse } from 'next/server'
import fs from 'fs'
import { auth } from '@/lib/auth'
import { getAllSettings, setSetting } from '@/lib/settings'
import { isCloud } from '@/lib/app-mode'

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (isCloud()) {
    return NextResponse.json({ error: 'Not available in cloud mode' }, { status: 403 })
  }
  const settings = await getAllSettings()
  return NextResponse.json({
    ...settings,
    jobs_path_exists:     fs.existsSync(settings.jobs_path),
    output_path_exists:   fs.existsSync(settings.output_path),
    outreach_path_exists: settings.outreach_path ? fs.existsSync(settings.outreach_path) : false,
  })
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (isCloud()) {
    return NextResponse.json({ error: 'Not available in cloud mode' }, { status: 403 })
  }
  const body: { jobs_path?: string; output_path?: string; outreach_path?: string } = await req.json()

  try {
    if (body.jobs_path     !== undefined) await setSetting('jobs_path',     body.jobs_path.trim())
    if (body.output_path   !== undefined) await setSetting('output_path',   body.output_path.trim())
    if (body.outreach_path !== undefined) await setSetting('outreach_path', body.outreach_path.trim())
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 })
  }

  return NextResponse.json({ ok: true, settings: await getAllSettings() })
}

import { NextResponse } from 'next/server'
import fs from 'fs'
import { getAllSettings, setSetting } from '@/lib/settings'

export async function GET() {
  const settings = getAllSettings()
  return NextResponse.json({
    ...settings,
    jobs_path_exists:   fs.existsSync(settings.jobs_path),
    output_path_exists: fs.existsSync(settings.output_path),
  })
}

export async function POST(req: Request) {
  const body: { jobs_path?: string; output_path?: string } = await req.json()

  if (body.jobs_path !== undefined) {
    setSetting('jobs_path', body.jobs_path.trim())
  }
  if (body.output_path !== undefined) {
    setSetting('output_path', body.output_path.trim())
  }

  return NextResponse.json({ ok: true, settings: getAllSettings() })
}

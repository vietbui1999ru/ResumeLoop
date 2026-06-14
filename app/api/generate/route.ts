import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { getAdapter } from '@/lib/db-adapter'
import { checkRateLimitBucket } from '@/lib/rate-limit'
import { GenerateInputSchema } from '@/lib/schemas/generate'

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = session.user.id

  if (!checkRateLimitBucket(`generate:${userId}`, 20, 20)) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })
  }

  const bodyParse = GenerateInputSchema.safeParse(await req.json())
  if (!bodyParse.success) {
    const message = bodyParse.error.errors[0]?.message ?? 'Invalid request body'
    return NextResponse.json({ error: message }, { status: 400 })
  }
  const { jobIds } = bodyParse.data

  const db = await getAdapter()
  const unknown: string[] = []
  for (const id of jobIds) {
    const row = await db.queryOne<{ one: number }>(
      'SELECT 1 as one FROM jd_jobs WHERE id = ? AND user_id = ?',
      [id, userId],
    )
    if (!row) unknown.push(id)
  }
  if (unknown.length > 0) {
    return NextResponse.json({ error: `Unknown job IDs: ${unknown.join(', ')}` }, { status: 400 })
  }

  const profileRow = await db.queryOne<{ data: string }>(
    'SELECT data FROM resume_profiles WHERE user_id = ? AND is_active = 1 LIMIT 1',
    [userId],
  )
  const profileData = profileRow?.data ?? ''

  if (!profileData || profileData.trim() === '' || profileData.trim() === '{}') {
    return NextResponse.json(
      { error: 'No active resume profile found. Add your work experience in the Profile editor before generating.' },
      { status: 422 },
    )
  }

  const mvsWarning = checkMVS(profileData)
  if (mvsWarning) {
    return NextResponse.json({ ok: true, validated: jobIds, ...mvsWarning })
  }

  return NextResponse.json({ ok: true, validated: jobIds, message: 'Jobs validated. Trigger generation via GET /api/generate/:jobId/stream for each job.' })
}

interface MVSWarning {
  warning: true
  missing: string[]
  message: string
}

function checkMVS(json: string): MVSWarning | null {
  let data: Record<string, unknown>
  try { data = JSON.parse(json) as Record<string, unknown> } catch { return null }

  const missing: string[] = []
  const contact = data.contact as Record<string, unknown> | undefined
  if (!contact?.name || String(contact.name).trim() === '') missing.push('contact.name')
  if (!contact?.email || String(contact.email).trim() === '') missing.push('contact.email')

  const experience = (data.experience as unknown[] | undefined) ?? []
  const projects = (data.projects as unknown[] | undefined) ?? []

  const hasWorkBullets = experience.some(e => {
    const exp = e as Record<string, unknown>
    const bullets = exp.bullets as Record<string, unknown[]> | undefined
    return bullets && Object.values(bullets).some(arr => Array.isArray(arr) && arr.length > 0)
  })
  const hasProjBullets = projects.some(p => {
    const proj = p as Record<string, unknown>
    return Array.isArray(proj.bullets) && (proj.bullets as unknown[]).length > 0
  })

  if (!hasWorkBullets && !hasProjBullets) {
    missing.push('experience[] or projects[] with at least 1 bullet')
  }

  if (missing.length === 0) return null
  return {
    warning: true,
    missing,
    message: `Resume profile is missing required fields: ${missing.join(', ')}. You can still generate but results may be incomplete.`,
  }
}

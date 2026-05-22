import { NextResponse } from 'next/server'
import { generateObject } from 'ai'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { getModel } from '@/lib/ai-client'
import { checkRateLimit } from '@/lib/rate-limit'

const CandidateProfileSchema = z.object({
  narrative: z.string().optional(),
  self_assessment: z.object({
    portrays_well: z.array(z.string()).optional(),
    known_gaps:    z.array(z.string()).optional(),
    not_this:      z.array(z.string()).optional(),
  }).optional(),
  target_posture: z.object({
    primary_roles:   z.array(z.string()).optional(),
    secondary_roles: z.array(z.string()).optional(),
    auth_urgency:    z.string().optional(),
    constraints:     z.array(z.string()).optional(),
  }).optional(),
})

const SYSTEM = `You are a resume strategist. Generate a candidate_profile for a job seeker.

Rules:
- narrative: 2-3 sentence professional summary
- portrays_well: concrete skills/achievements, not vague traits (3-4 items)
- known_gaps: honest, short (2-3 items max)
- not_this: roles/functions to explicitly NOT pitch for (important for focus)
- auth_urgency: one sentence on work authorization status`

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = session.user.id

  if (!checkRateLimit(`profile-gen:${userId}`)) {
    return NextResponse.json({ error: 'Too many requests — wait a minute' }, { status: 429 })
  }

  const body = await req.json() as { description?: string }
  const description = (body.description ?? '').trim().slice(0, 2000)
  if (!description) return NextResponse.json({ error: 'description required' }, { status: 400 })

  let model
  try {
    model = await getModel(userId)
  } catch {
    return NextResponse.json({ error: 'No AI provider configured — go to Settings → AI' }, { status: 503 })
  }

  try {
    const { object } = await generateObject({
      model,
      schema: CandidateProfileSchema,
      system: SYSTEM,
      messages: [{ role: 'user', content: `Generate candidate_profile for:\n\n${description}` }],
      maxOutputTokens: 800,
    })

    return NextResponse.json({ candidate_profile: object })
  } catch (e) {
    const msg = String(e)
    if (msg.includes('No AI provider')) return NextResponse.json({ error: msg }, { status: 503 })
    if (msg.toLowerCase().includes('unauthorized') || msg.includes('401'))
      return NextResponse.json({ error: 'API key rejected — check Settings → AI' }, { status: 400 })
    return NextResponse.json({ error: 'Generation failed — try again' }, { status: 502 })
  }
}

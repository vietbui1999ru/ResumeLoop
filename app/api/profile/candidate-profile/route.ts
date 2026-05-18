import { NextResponse } from 'next/server'
import { generateText } from 'ai'
import { auth } from '@/lib/auth'
import { getModel } from '@/lib/ai-client'
import { checkRateLimit, extractIp } from '@/lib/rate-limit'

const SYSTEM = `You are a resume strategist. Generate a candidate_profile JSON object for a job seeker.

The JSON must match this exact shape (all fields optional but include what you can infer):
{
  "narrative": "2-3 sentence professional summary",
  "self_assessment": {
    "portrays_well": ["strength 1", "strength 2", "strength 3", "strength 4"],
    "known_gaps": ["gap 1", "gap 2"],
    "not_this": ["anti-target 1", "anti-target 2"]
  },
  "target_posture": {
    "primary_roles": ["Role 1", "Role 2"],
    "secondary_roles": ["Role A"],
    "auth_urgency": "one sentence on work authorization",
    "constraints": ["constraint 1"]
  }
}

Rules:
- portrays_well: concrete skills/achievements, not vague traits
- known_gaps: honest, short (2-3 items max)
- not_this: roles/functions to explicitly NOT pitch as (important for focus)
- Respond with ONLY valid JSON, no markdown fences, no explanation`

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = session.user.id

  if (!checkRateLimit(`profile-gen:${extractIp(req)}`)) {
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
    const { text } = await generateText({
      model,
      system: SYSTEM,
      messages: [{ role: 'user', content: `Generate candidate_profile for:\n\n${description}` }],
      maxOutputTokens: 800,
    })

    // Validate the response is parseable JSON with expected shape
    const parsed = JSON.parse(text.trim())
    if (typeof parsed !== 'object' || parsed === null) throw new Error('not an object')

    return NextResponse.json({ candidate_profile: parsed })
  } catch (e) {
    const msg = String(e)
    if (msg.includes('No AI provider')) return NextResponse.json({ error: msg }, { status: 503 })
    if (msg.toLowerCase().includes('unauthorized') || msg.includes('401'))
      return NextResponse.json({ error: 'API key rejected — check Settings → AI' }, { status: 400 })
    if (msg.includes('SyntaxError') || msg.includes('not an object'))
      return NextResponse.json({ error: 'AI returned invalid JSON — try again' }, { status: 502 })
    return NextResponse.json({ error: 'Generation failed — try again' }, { status: 502 })
  }
}

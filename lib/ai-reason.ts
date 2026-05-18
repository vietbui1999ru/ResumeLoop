import { generateText, jsonSchema } from 'ai'
import { buildSystemPrompt } from './prompt-context'
import { getModel } from './ai-client'
import { logAiUsage } from './ai-usage'
import { getActiveConfig } from './user-settings'

export interface ReasoningResult {
  track:        string
  workVariant:  string
  workIds:      string[]
  projects:     string[]
  personaTitle: string
  tagline:      string
  skillsRows:   string[]
  reasoning:    string
}

const VALID_WORK_IDS = ['gitlab', 'carboncopies', 'udayton', 'augustana']

const DECISION_SCHEMA = jsonSchema<ReasoningResult>({
  type: 'object',
  properties: {
    track:        { type: 'string', description: 'Role track from the role-track table' },
    workVariant:  { type: 'string', enum: ['genai', 'systems', 'IT-track'] },
    workIds:      { type: 'array', items: { type: 'string', enum: VALID_WORK_IDS }, minItems: 3, maxItems: 3 },
    projects:     { type: 'array', items: { type: 'string' }, minItems: 3, maxItems: 3 },
    personaTitle: { type: 'string', maxLength: 60 },
    tagline:      { type: 'string', maxLength: 76 },
    skillsRows:   { type: 'array', items: { type: 'string' }, minItems: 5, maxItems: 5 },
    reasoning: {
      type: 'string',
      description:
        'Structured markdown with exactly 5 sections: ## Track, ## Work Experience, ## Projects, ## Tagline, ## Skills. Each section explains why this choice matches the JD. Reference specific JD keywords. 2-4 sentences or bullet points per section.',
    },
  },
  required: ['track', 'workVariant', 'workIds', 'projects', 'personaTitle', 'tagline', 'skillsRows', 'reasoning'],
})

export async function reasonForJob(rawContent: string, masterData?: string, userId = 'default'): Promise<ReasoningResult> {
  const model        = await getModel(userId)
  const systemPrompt = await buildSystemPrompt(masterData)

  const { toolCalls, usage } = await generateText({
    model,
    maxOutputTokens: 2048,
    abortSignal: AbortSignal.timeout(60_000),
    system: systemPrompt,
    tools: {
      resume_decision: {
        description: 'Select resume components tailored to this job posting',
        inputSchema: DECISION_SCHEMA,
      },
    },
    toolChoice: { type: 'tool', toolName: 'resume_decision' },
    messages: [{ role: 'user', content: `Job Description:\n\n${rawContent}` }],
  })

  const call = toolCalls.find(t => t.toolName === 'resume_decision')
  if (!call) throw new Error('No resume_decision tool call in AI response')

  const result = call.input as ReasoningResult
  validateResult(result)
  const cfg = await getActiveConfig(userId)
  if (cfg) await logAiUsage(userId, cfg.provider, cfg.model, 'reason', usage.inputTokens ?? 0, usage.outputTokens ?? 0)
  return result
}

export function validateResult(r: ReasoningResult): void {
  if (!r.workIds  || r.workIds.length  !== 3) throw new Error(`workIds must have 3 entries, got ${r.workIds?.length}`)
  if (!r.projects || r.projects.length !== 3) throw new Error(`projects must have 3 entries, got ${r.projects?.length}`)
  if (!r.skillsRows || r.skillsRows.length !== 5) throw new Error(`skillsRows must have 5 entries, got ${r.skillsRows?.length}`)
  if (!r.tagline)      throw new Error('tagline missing from AI response')
  if (!r.personaTitle) throw new Error('personaTitle missing from AI response')

  if (r.tagline.length > 76) {
    const t = r.tagline.slice(0, 76)
    const sp = t.lastIndexOf(' ')
    r.tagline = sp > 60 ? t.slice(0, sp) : t
  }
  if (r.personaTitle.length > 60) r.personaTitle = r.personaTitle.slice(0, 60).trimEnd()
  if (!r.reasoning || r.reasoning.trim() === '') throw new Error('reasoning missing from AI response')
}

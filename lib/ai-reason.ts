import Anthropic from '@anthropic-ai/sdk'
import { buildSystemPrompt } from './prompt-context'

export interface ReasoningResult {
  track: string
  workVariant: string
  workIds: string[]
  projects: string[]
  personaTitle: string
  tagline: string
  skillsRows: string[]
  reasoning: string
}

const VALID_WORK_IDS = ['gitlab', 'carboncopies', 'udayton', 'augustana']

const TOOL_SCHEMA: Anthropic.Tool = {
  name: 'resume_decision',
  description: 'Select resume components tailored to this job posting',
  input_schema: {
    type: 'object' as const,
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
  },
}

export async function reasonForJob(rawContent: string, masterData?: string): Promise<ReasoningResult> {
  const client = new Anthropic()
  const systemPrompt = buildSystemPrompt(masterData)

  const response = await client.messages.create({
    model: 'claude-opus-4-7',
    max_tokens: 2048,
    system: [
      {
        type: 'text',
        text: systemPrompt,
        cache_control: { type: 'ephemeral' },
      },
    ],
    tools: [TOOL_SCHEMA],
    tool_choice: { type: 'tool', name: 'resume_decision' },
    messages: [
      {
        role: 'user',
        content: `Job Description:\n\n${rawContent}`,
      },
    ],
  })

  const toolUse = response.content.find(b => b.type === 'tool_use')
  if (!toolUse || toolUse.type !== 'tool_use') {
    throw new Error('No tool_use block in AI response')
  }
  if (toolUse.name !== 'resume_decision') {
    throw new Error(`Unexpected tool: ${toolUse.name}`)
  }

  const result = toolUse.input as ReasoningResult
  validateResult(result)
  return result
}

export function validateResult(r: ReasoningResult): void {
  if (!r.workIds || r.workIds.length !== 3) throw new Error(`workIds must have 3 entries, got ${r.workIds?.length}`)
  if (!r.projects || r.projects.length !== 3) throw new Error(`projects must have 3 entries, got ${r.projects?.length}`)
  if (!r.skillsRows || r.skillsRows.length !== 5) throw new Error(`skillsRows must have 5 entries, got ${r.skillsRows?.length}`)

  if (!r.tagline) throw new Error('tagline missing from AI response')
  if (!r.personaTitle) throw new Error('personaTitle missing from AI response')

  // Auto-trim instead of throwing — fix-loop handles tagline constraints downstream
  if (r.tagline.length > 76) {
    let t = r.tagline.slice(0, 76)
    const sp = t.lastIndexOf(' ')
    r.tagline = sp > 60 ? t.slice(0, sp) : t
  }
  if (r.personaTitle.length > 60) {
    r.personaTitle = r.personaTitle.slice(0, 60).trimEnd()
  }

  if (!r.reasoning || r.reasoning.trim() === '') throw new Error('reasoning missing from AI response')
}

import { generateText, jsonSchema } from 'ai'
import { getModel }        from '../ai-client'
import { getActiveConfig } from '../user-settings'
import { logAiUsage }      from '../ai-usage'
import type { SparseProfile } from './types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyToolCall = { toolName: string; input: any }

const MIN_LENGTH = 20

const SYSTEM_PROMPT = `You extract professional profile data from freeform text.
Input may be a LinkedIn About/Experience copy-paste, a personal bio, or plain resume text.
Extract only what is explicitly present — never invent or infer data not in the text.
IDs must be lowercase slugs: letters, digits, hyphens only (e.g. "acme-corp").
Bullet text: concise action-verb phrases 116 chars max each.
Skills genai object: keys are category labels (e.g. "Languages"), values are comma-separated techs.`

const PROFILE_SCHEMA = {
  type: 'object' as const,
  properties: {
    contact: {
      type: 'object',
      properties: {
        name: { type: 'string' }, email: { type: 'string' },
        phone: { type: 'string' }, location: { type: 'string' },
        linkedin: { type: 'string' }, github: { type: 'string' }, website: { type: 'string' },
      },
    },
    experience: {
      type: 'array',
      items: {
        type: 'object', required: ['id'],
        properties: {
          id:       { type: 'string', description: 'lowercase slug e.g. "acme-corp"' },
          title:    { type: 'string' }, company: { type: 'string' },
          location: { type: 'string' }, dates: { type: 'string' },
          bullets: {
            type: 'object', required: ['genai'],
            properties: {
              genai: { type: 'array', items: { type: 'string', maxLength: 116 }, maxItems: 6 },
            },
          },
        },
      },
    },
    projects: {
      type: 'array',
      items: {
        type: 'object', required: ['id'],
        properties: {
          id: { type: 'string' }, name: { type: 'string' }, url: { type: 'string' },
          short_stack: { type: 'string', maxLength: 40 }, dates: { type: 'string' },
          bullets: { type: 'array', items: { type: 'string', maxLength: 116 }, maxItems: 6 },
        },
      },
    },
    skills: {
      type: 'object',
      properties: { genai: { type: 'object', additionalProperties: { type: 'string' } } },
    },
  },
}

export async function extractFromPaste(
  text: string,
  userId: string,
  _cfgOverride: unknown,
): Promise<SparseProfile> {
  if (text.trim().length < MIN_LENGTH) throw new Error('Input too short to extract meaningful data')

  const result = await generateText({
    model:           await getModel(userId),
    system:          SYSTEM_PROMPT,
    messages:        [{ role: 'user', content: `Extract profile data from this text:\n\n${text.slice(0, 20_000)}` }],
    tools: {
      extract_profile: {
        description: 'Extract structured profile data from the provided text',
        inputSchema: jsonSchema<SparseProfile>(PROFILE_SCHEMA),
      },
    },
    toolChoice:      'required',
    maxOutputTokens: 2000,
  })

  const call = (result.toolCalls as AnyToolCall[]).find(t => t.toolName === 'extract_profile')
  if (!call) throw new Error('AI did not call extract_profile tool not called')

  const cfg = await getActiveConfig(userId)
  if (cfg) {
    logAiUsage(userId, cfg.provider, cfg.model, 'ingest-paste',
      result.usage?.inputTokens ?? 0, result.usage?.outputTokens ?? 0).catch(() => {})
  }

  return call.input as SparseProfile
}

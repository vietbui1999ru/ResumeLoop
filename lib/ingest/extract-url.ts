import { generateText, jsonSchema } from 'ai'
import { getModel }        from '../ai-client'
import { getActiveConfig } from '../user-settings'
import { logAiUsage }      from '../ai-usage'
import { getAdapter }      from '../db-adapter'
import type { SparseProfile } from './types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyToolCall = { toolName: string; input: any }

export async function getFirecrawlKey(userId: string): Promise<string | null> {
  const db  = await getAdapter()
  const row = await db.queryOne<{ value: string }>(
    `SELECT value FROM app_settings WHERE key = ?`, [`firecrawl_key:${userId}`],
  )
  return row?.value?.trim() || null
}

export async function scrapeUrl(url: string, firecrawlKey: string | null): Promise<string> {
  if (firecrawlKey) {
    try {
      const { default: FirecrawlApp } = await import('@mendable/firecrawl-js') as unknown as {
        default: new (opts: { apiKey: string }) => {
          scrapeUrl: (url: string, opts: object) => Promise<{ success: boolean; markdown?: string; error?: string }>
        }
      }
      const app = new FirecrawlApp({ apiKey: firecrawlKey })
      const res = await app.scrapeUrl(url, { formats: ['markdown'] })
      if (res.success && res.markdown) return res.markdown.slice(0, 30_000)
      console.warn('[ingest-url] Firecrawl failed:', res.error, '— falling back to fetch')
    } catch (e) {
      console.warn('[ingest-url] Firecrawl error:', e, '— falling back to fetch')
    }
  }

  const resp = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ResumeLoop/1.0)' },
    signal:  AbortSignal.timeout(15_000),
  })
  if (!resp.ok) throw new Error(`Failed to fetch URL: HTTP ${resp.status}`)
  const html = await resp.text()
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 20_000)
}

const SYSTEM_PROMPT = `You extract professional profile data from a scraped webpage.
The page may be a personal website, portfolio, company page, or online resume.
Extract all clearly stated professional information — never guess or infer.
IDs: lowercase slug. Bullet text: action-verb phrases 116 chars max.
short_stack: 3-4 key technologies, 40 chars max.`

export async function extractFromUrl(url: string, userId: string): Promise<SparseProfile> {
  const firecrawlKey = await getFirecrawlKey(userId)
  const pageContent  = await scrapeUrl(url, firecrawlKey)

  const result = await generateText({
    model:           await getModel(userId),
    system:          SYSTEM_PROMPT,
    messages:        [{ role: 'user', content: `URL: ${url}\n\nPage content:\n\n${pageContent}` }],
    tools: {
      extract_profile: {
        description: 'Extract professional profile data from the scraped page',
        inputSchema: jsonSchema<SparseProfile>({
          type: 'object',
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
                  id: { type: 'string' }, title: { type: 'string' }, company: { type: 'string' },
                  location: { type: 'string' }, dates: { type: 'string' },
                  bullets: { type: 'object', required: ['genai'],
                    properties: { genai: { type: 'array', items: { type: 'string', maxLength: 116 }, maxItems: 6 } } },
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
            candidate_profile: {
              type: 'object',
              properties: { narrative: { type: 'string' } },
            },
          },
        }),
      },
    },
    toolChoice:      'required',
    maxOutputTokens: 2500,
  })

  const call = (result.toolCalls as AnyToolCall[]).find(t => t.toolName === 'extract_profile')
  if (!call) throw new Error('AI did not call extract_profile tool')

  const cfg = await getActiveConfig(userId)
  if (cfg) {
    logAiUsage(userId, cfg.provider, cfg.model, 'ingest-url',
      result.usage?.inputTokens ?? 0, result.usage?.outputTokens ?? 0).catch(() => {})
  }

  return call.input as SparseProfile
}

import { NextResponse } from 'next/server'
import { generateText }  from 'ai'
import { auth } from '@/lib/auth'
import {
  PROVIDERS, DEFAULT_MODELS, setProviderConfig, deleteProviderConfig,
  listProviderHints, setActiveProvider, getActiveProvider, maskKey,
  type Provider,
} from '@/lib/user-settings'
import { buildModel } from '@/lib/ai-client'
import { checkRateLimit, extractIp } from '@/lib/rate-limit'
import { validateOllamaUrl } from '@/lib/ollama-url'

// ── Input limits ──────────────────────────────────────────────────────────────
const MAX_KEY_LEN   = 500
const MAX_MODEL_LEN = 100

// ── Format validation ─────────────────────────────────────────────────────────
const KEY_PATTERNS: Partial<Record<Provider, RegExp>> = {
  anthropic:  /^sk-ant-/,
  openai:     /^sk-(?!ant-|or-)/,
  google:     /^AIza/,
  groq:       /^gsk_/,
  openrouter: /^sk-or-/,
}

// Safe model names: provider/model-name:tag — no shell metacharacters
const MODEL_RE = /^[a-zA-Z0-9/_:.\-]{1,100}$/

function validateFormat(provider: Provider, key: string): string | null {
  if (provider === 'ollama') return null
  const pattern = KEY_PATTERNS[provider]
  if (pattern && !pattern.test(key)) return `Key format invalid for ${provider}`
  if (key.length < 20) return 'Key too short'
  return null
}

// ── Live key test ─────────────────────────────────────────────────────────────
async function testKey(provider: Provider, apiKey: string, model: string, baseUrl?: string): Promise<string | null> {
  try {
    // Ollama doesn't use API keys; use a placeholder to avoid forwarding any real key
    // to a user-controlled base URL (SSRF key-harvesting mitigation)
    const keyToTest = provider === 'ollama' ? 'ollama' : apiKey
    const testModel = buildModel(provider, keyToTest, model, baseUrl)
    // Thinking models consume thinking tokens within maxOutputTokens, so maxOutputTokens:1
    // always fails. Use 200 for Google (Gemini 2.5) and Anthropic (Opus 4.7 with extended thinking).
    const needsThinkingBudget = provider === 'google' ||
      (provider === 'anthropic' && model.includes('opus'))
    const maxOutputTokens = needsThinkingBudget ? 200 : 1
    await generateText({ model: testModel, maxOutputTokens, messages: [{ role: 'user', content: '.' }] })
    return null
  } catch (e) {
    const raw = String(e)
    const msg = raw.toLowerCase()
    console.error(`[settings/ai] testKey provider=${provider} model=${model} error: ${raw.slice(0, 500)}`)
    if (msg.includes('401') || msg.includes('unauthorized') || msg.includes('invalid api key') || msg.includes('invalid_api_key'))
      return 'API key rejected — check the key and try again'
    if (msg.includes('404') || (msg.includes('not found') && msg.includes('model')))
      return 'Model not found for this provider — check the model name'
    if (msg.includes('econnrefused') || msg.includes('fetch failed'))
      return 'Could not connect to provider — check the URL and that the service is running'
    return `Provider test failed — ${raw.slice(0, 120)}`
  }
}

// ── GET ───────────────────────────────────────────────────────────────────────
export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const USER_ID = session.user.id

  let configs: Awaited<ReturnType<typeof listProviderHints>>
  try {
    configs = await listProviderHints(USER_ID)
  } catch {
    configs = []
  }
  return NextResponse.json({
    active_provider: await getActiveProvider(USER_ID),
    providers:       PROVIDERS,
    default_models:  DEFAULT_MODELS,
    configs,
  })
}

// ── POST ──────────────────────────────────────────────────────────────────────
export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const USER_ID = session.user.id

  if (!checkRateLimit(`settings:${extractIp(req)}`)) {
    return NextResponse.json({ error: 'Too many requests — wait a minute' }, { status: 429 })
  }

  let body: { provider?: string; api_key?: string; model?: string; base_url?: string; set_active?: boolean }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const provider = body.provider as Provider
  if (!provider || !PROVIDERS.includes(provider)) {
    return NextResponse.json({ error: `provider must be one of: ${PROVIDERS.join(', ')}` }, { status: 400 })
  }

  const rawKey   = (body.api_key ?? '').trim()
  const rawModel = (body.model   ?? DEFAULT_MODELS[provider]).trim()
  const rawUrl   = body.base_url?.trim() || undefined

  // Length caps
  if (rawKey.length   > MAX_KEY_LEN)   return NextResponse.json({ error: 'api_key too long'  }, { status: 400 })
  if (rawModel.length > MAX_MODEL_LEN) return NextResponse.json({ error: 'model name too long' }, { status: 400 })

  // Model name must be safe characters only
  if (!MODEL_RE.test(rawModel)) {
    return NextResponse.json({ error: 'Invalid model name — use alphanumeric, /, -, :, . only' }, { status: 400 })
  }

  // Ollama: validate base_url for SSRF
  let safeUrl: string | undefined
  if (provider === 'ollama') {
    const defaultUrl = 'http://localhost:11434/v1'
    const urlToCheck = rawUrl ?? defaultUrl
    safeUrl = validateOllamaUrl(urlToCheck) ?? undefined
    if (!safeUrl) {
      return NextResponse.json({ error: 'base_url must be a local or private-network address (localhost / 192.168.x.x / 10.x.x.x)' }, { status: 400 })
    }
  }

  if (provider !== 'ollama' && !rawKey) {
    return NextResponse.json({ error: 'api_key required' }, { status: 400 })
  }

  // Key format check
  const fmtErr = validateFormat(provider, rawKey)
  if (fmtErr) return NextResponse.json({ error: fmtErr }, { status: 400 })

  // Live test (uses sanitized inputs only)
  console.info(`[settings/ai] testing provider=${provider} model=${rawModel}`)
  const testErr = await testKey(provider, rawKey, rawModel, safeUrl)
  if (testErr) {
    console.warn(`[settings/ai] testKey failed provider=${provider} model=${rawModel}: ${testErr}`)
    return NextResponse.json({ error: testErr }, { status: 400 })
  }
  console.info(`[settings/ai] testKey ok provider=${provider} model=${rawModel}`)

  try {
    await setProviderConfig(USER_ID, provider, rawKey, rawModel, safeUrl)
    if (body.set_active) await setActiveProvider(USER_ID, provider)
  } catch (e) {
    if (String(e).includes('ENCRYPTION_KEY')) {
      return NextResponse.json(
        { error: 'ENCRYPTION_KEY is not set on this server. Add it to .env.local (dev) or Secrets Manager (prod): openssl rand -hex 32' },
        { status: 503 }
      )
    }
    throw e
  }

  const hint = rawKey.length > 0 ? maskKey(rawKey) : ''
  return NextResponse.json({ ok: true, key_hint: hint })
}

// ── DELETE ────────────────────────────────────────────────────────────────────
export async function DELETE(req: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const USER_ID = session.user.id

  const url      = new URL(req.url)
  const provider = url.searchParams.get('provider') as Provider | null
  if (!provider || !PROVIDERS.includes(provider)) {
    return NextResponse.json({ error: 'provider query param required' }, { status: 400 })
  }
  await deleteProviderConfig(USER_ID, provider)
  return NextResponse.json({ ok: true })
}

// ── PATCH — set active provider ───────────────────────────────────────────────
export async function PATCH(req: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const USER_ID = session.user.id

  let body: { provider?: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const { provider } = body
  if (!provider || !PROVIDERS.includes(provider as Provider)) {
    return NextResponse.json({ error: 'provider required' }, { status: 400 })
  }
  await setActiveProvider(USER_ID, provider as Provider)
  return NextResponse.json({ ok: true })
}

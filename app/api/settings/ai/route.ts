import { NextResponse } from 'next/server'
import { generateText }  from 'ai'
import { auth } from '@/lib/auth'
import {
  PROVIDERS, DEFAULT_MODELS, setProviderConfig, deleteProviderConfig,
  listProviderHints, setActiveProvider, getActiveProvider,
  type Provider,
} from '@/lib/user-settings'
import { buildModel } from '@/lib/ai-client'

// ── Input limits ──────────────────────────────────────────────────────────────
const MAX_KEY_LEN   = 500
const MAX_MODEL_LEN = 100
const MAX_URL_LEN   = 200

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

// ── SSRF guard for Ollama base_url ────────────────────────────────────────────
// Blocks cloud metadata endpoints and only allows loopback + RFC-1918 private ranges.
const BLOCKED_HOSTS = new Set([
  '169.254.169.254',      // AWS EC2 / Azure IMDS
  '169.254.170.2',        // AWS ECS metadata
  '100.100.100.200',      // Alibaba Cloud metadata
  'metadata.google.internal',
  'metadata.internal',
])

function validateOllamaUrl(raw: string): string | null {
  let u: URL
  try { u = new URL(raw) } catch { return null }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
  if (raw.length > MAX_URL_LEN) return null

  const host = u.hostname.toLowerCase()

  // Block cloud metadata hosts
  if (BLOCKED_HOSTS.has(host)) return null
  if (host.includes('169.254.') || host.includes('100.100.')) return null

  // Allow only loopback + private RFC-1918 ranges
  if (host === 'localhost')             return raw
  if (/^127\./.test(host))             return raw   // 127.0.0.0/8
  if (/^::1$/.test(host))              return raw   // IPv6 loopback
  if (/^192\.168\./.test(host))        return raw   // 192.168.0.0/16
  if (/^10\./.test(host))              return raw   // 10.0.0.0/8
  if (/^172\.(1[6-9]|2[0-9]|3[01])\./.test(host)) return raw  // 172.16.0.0/12

  return null  // reject all other hosts (public IPs, external hostnames)
}

// ── Rate limiter (per-IP, 10 attempts/min) ────────────────────────────────────
const attempts = new Map<string, { count: number; resetAt: number }>()
const WINDOW_MS    = 60_000
const MAX_ATTEMPTS = 10

function extractIp(req: Request): string {
  // Use the first (leftmost) address from x-forwarded-for — the original client.
  // Not forgeable when behind a trusted reverse proxy that strips/replaces the header.
  const fwd = req.headers.get('x-forwarded-for')
  if (fwd) return fwd.split(',')[0].trim()
  return 'local'
}

function checkRateLimit(ip: string): boolean {
  const now = Date.now()
  const entry = attempts.get(ip)
  if (!entry || now > entry.resetAt) {
    attempts.set(ip, { count: 1, resetAt: now + WINDOW_MS })
    return true
  }
  if (entry.count >= MAX_ATTEMPTS) return false
  entry.count++
  return true
}

// ── Live key test ─────────────────────────────────────────────────────────────
async function testKey(provider: Provider, apiKey: string, model: string, baseUrl?: string): Promise<string | null> {
  try {
    const testModel = buildModel(provider, apiKey, model, baseUrl)
    await generateText({ model: testModel, maxOutputTokens: 1, messages: [{ role: 'user', content: '.' }] })
    return null
  } catch (e) {
    const msg = String(e)
    if (msg.includes('401') || msg.includes('auth') || msg.includes('invalid') || msg.includes('Unauthorized'))
      return 'API key rejected — check the key and try again'
    if (msg.includes('404') || msg.includes('model') || msg.includes('not found'))
      return 'Model not found for this provider — check the model name'
    if (msg.includes('ECONNREFUSED') || msg.includes('fetch failed'))
      return 'Could not connect to provider — check the URL and that the service is running'
    return 'Provider test failed — check key and model name'
  }
}

// ── GET ───────────────────────────────────────────────────────────────────────
export async function GET() {
  const session = await auth()
  const USER_ID = session?.user?.id ?? 'default'

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
  const USER_ID = session?.user?.id ?? 'default'

  if (!checkRateLimit(extractIp(req))) {
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
  const testErr = await testKey(provider, rawKey, rawModel, safeUrl)
  if (testErr) return NextResponse.json({ error: testErr }, { status: 400 })

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

  const hint = rawKey.length > 0 ? rawKey.slice(0, 16) + '••••••••••••••••' : ''
  return NextResponse.json({ ok: true, key_hint: hint })
}

// ── DELETE ────────────────────────────────────────────────────────────────────
export async function DELETE(req: Request) {
  const session = await auth()
  const USER_ID = session?.user?.id ?? 'default'

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
  const USER_ID = session?.user?.id ?? 'default'

  let body: { provider?: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const { provider } = body
  if (!provider || !PROVIDERS.includes(provider as Provider)) {
    return NextResponse.json({ error: 'provider required' }, { status: 400 })
  }
  await setActiveProvider(USER_ID, provider as Provider)
  return NextResponse.json({ ok: true })
}

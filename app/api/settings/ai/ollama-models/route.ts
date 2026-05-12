import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'

// Re-use the same SSRF allowlist logic as the main AI settings route.
// Only loopback + RFC-1918 ranges allowed — no public IPs, no cloud metadata.
const BLOCKED_HOSTS = new Set([
  '169.254.169.254',
  '169.254.170.2',
  '100.100.100.200',
  'metadata.google.internal',
  'metadata.internal',
])

function validateOllamaUrl(raw: string): string | null {
  let u: URL
  try { u = new URL(raw) } catch { return null }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
  if (raw.length > 200) return null

  const host = u.hostname.toLowerCase()
  if (BLOCKED_HOSTS.has(host)) return null
  if (host.includes('169.254.') || host.includes('100.100.')) return null

  if (host === 'localhost')             return raw
  if (/^127\./.test(host))             return raw
  if (/^::1$/.test(host))              return raw
  if (/^192\.168\./.test(host))        return raw
  if (/^10\./.test(host))              return raw
  if (/^172\.(1[6-9]|2[0-9]|3[01])\./.test(host)) return raw

  return null
}

interface OllamaModel {
  name:   string
  model:  string
}

interface OllamaTagsResponse {
  models: OllamaModel[]
}

export async function GET(req: Request) {
  await auth() // require session

  const url       = new URL(req.url)
  const rawBase   = url.searchParams.get('base_url') ?? 'http://localhost:11434/v1'
  const safeBase  = validateOllamaUrl(rawBase)

  if (!safeBase) {
    return NextResponse.json(
      { error: 'base_url must be a local or private-network address' },
      { status: 400 },
    )
  }

  // Strip the /v1 suffix if present — /api/tags lives at the root
  const baseOrigin = safeBase.replace(/\/v1\/?$/, '')

  try {
    const res = await fetch(`${baseOrigin}/api/tags`, {
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) {
      return NextResponse.json(
        { error: `Ollama returned ${res.status} — is the server running?` },
        { status: 502 },
      )
    }
    const data = await res.json() as OllamaTagsResponse
    const models = (data.models ?? []).map((m: OllamaModel) => m.name).filter(Boolean)
    return NextResponse.json({ models })
  } catch (e) {
    const msg = String(e)
    if (msg.includes('ECONNREFUSED') || msg.includes('fetch failed') || msg.includes('timeout')) {
      return NextResponse.json(
        { error: 'Could not connect to Ollama — is the server running?' },
        { status: 502 },
      )
    }
    return NextResponse.json({ error: 'Failed to fetch models' }, { status: 502 })
  }
}

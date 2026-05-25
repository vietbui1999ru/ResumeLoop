import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { validateOllamaUrl } from '@/lib/ollama-url'
import { OLLAMA_DEFAULT_BASE_URL } from '@/lib/config'

interface OllamaModel {
  name:   string
  model:  string
}

interface OllamaTagsResponse {
  models: OllamaModel[]
}

export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url       = new URL(req.url)
  const rawBase   = url.searchParams.get('base_url') ?? OLLAMA_DEFAULT_BASE_URL
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
      redirect: 'error',  // never follow redirects — prevents SSRF via 302 to IMDS
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

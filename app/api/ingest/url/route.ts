import { NextResponse }   from 'next/server'
import { lookup }         from 'node:dns/promises'
import * as https         from 'node:https'
import * as http          from 'node:http'
import { auth }           from '@/lib/auth'
import { createIngestionSource, updateIngestionSource } from '@/lib/ingest/db'
import { extractFromUrl } from '@/lib/ingest/extract-url'

const BLOCKED_HOSTS = new Set([
  'localhost',
  'metadata.google.internal',
])

function normalizeHost(hostname: string): string {
  const host = hostname.toLowerCase()
  return host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host
}

function isDisallowedHost(hostname: string): boolean {
  const host = normalizeHost(hostname)
  if (BLOCKED_HOSTS.has(host)) return true

  // IPv4
  if (/^0\./.test(host)) return true
  if (/^10\./.test(host)) return true
  if (/^127\./.test(host)) return true
  if (/^169\.254\./.test(host)) return true
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return true
  if (/^192\.168\./.test(host)) return true
  if (/^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(host)) return true
  if (host === '169.254.169.254' || host === '169.254.170.2') return true

  // IPv6
  if (host === '::1') return true
  if (/^fe[89ab][0-9a-f]:/i.test(host)) return true // link-local fe80::/10
  if (/^f[cd][0-9a-f]{2}:/i.test(host)) return true // unique-local fc00::/7

  // IPv4-mapped IPv6
  if (/^::ffff:/i.test(host)) {
    const mapped = host.replace(/^::ffff:/i, '')
    return isDisallowedHost(mapped)
  }

  return false
}

// Returns the first safe resolved IP for hostname, throws if disallowed.
async function resolvePublicHost(hostname: string): Promise<string> {
  const host = normalizeHost(hostname)
  if (isDisallowedHost(host)) throw new Error('disallowed-host')

  // Direct IP — no DNS resolution needed.
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(':')) return host

  const resolved = await lookup(host, { all: true, verbatim: true })
  const safe = resolved.find(r => !isDisallowedHost(r.address))
  if (!safe) throw new Error('disallowed-host')
  return safe.address
}

// HEAD request pinned to a pre-resolved IP — prevents DNS rebinding between check and fetch.
function pinnedHead(url: URL, resolvedIp: string): Promise<{ status: number; location: string | null }> {
  return new Promise((resolve, reject) => {
    const lib = url.protocol === 'https:' ? https : http
    const port = url.port ? parseInt(url.port, 10) : url.protocol === 'https:' ? 443 : 80
    const req = lib.request(
      {
        hostname: resolvedIp,
        port,
        path: url.pathname + url.search,
        method: 'HEAD',
        headers: { Host: url.hostname, 'User-Agent': 'Mozilla/5.0 (compatible; ResumeLoop/1.0)' },
        servername: url.hostname,
        timeout: 8_000,
      },
      (res) => {
        resolve({ status: res.statusCode ?? 0, location: res.headers.location ?? null })
        res.resume()
      },
    )
    req.on('timeout', () => req.destroy(new Error('timeout')))
    req.on('error', reject)
    req.end()
  })
}

async function validateRedirectChain(rawUrl: string): Promise<string> {
  let current = new URL(rawUrl)
  for (let i = 0; i < 5; i += 1) {
    if (!['http:', 'https:'].includes(current.protocol)) throw new Error('invalid-url')
    const resolvedIp = await resolvePublicHost(current.hostname)

    // Use pinned IP for the request — same IP that passed validation, no TOCTOU window.
    const resp = await pinnedHead(current, resolvedIp)
    if (resp.status < 300 || resp.status >= 400) return current.toString()

    const location = resp.location
    if (!location) return current.toString()
    current = new URL(location, current)
  }
  throw new Error('too-many-redirects')
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = session.user.id

  const body = await req.json() as { url?: string }
  if (!body.url?.trim()) return NextResponse.json({ error: 'url required' }, { status: 400 })

  let parsed: URL
  try {
    parsed = new URL(body.url)
  } catch {
    return NextResponse.json({ error: 'Invalid URL' }, { status: 400 })
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return NextResponse.json({ error: 'Only http:// and https:// URLs are allowed' }, { status: 400 })
  }

  let validUrl: string
  try {
    validUrl = await validateRedirectChain(parsed.toString())
  } catch {
    return NextResponse.json({ error: 'URL points to a disallowed host' }, { status: 400 })
  }

  const source = await createIngestionSource(userId, 'url', validUrl)

  try {
    await updateIngestionSource(source.id, userId, { status: 'processing' })
    const partial = await extractFromUrl(validUrl, userId)
    await updateIngestionSource(source.id, userId, { status: 'done', extractedPartial: partial })
    return NextResponse.json({ source: { ...source, status: 'done', extractedPartial: partial } })
  } catch (e) {
    const raw = e instanceof Error ? e.message : String(e)
    const userMsg = /api.?key|x-api-key|authentication|unauthorized|401/i.test(raw)
      ? 'Extraction failed — check your AI model key in Settings'
      : /fetch|ECONNREFUSED|timeout|network/i.test(raw)
        ? 'Failed to reach the URL — check it and try again'
        : raw.slice(0, 200)
    await updateIngestionSource(source.id, userId, { status: 'failed', errorMsg: userMsg })
    return NextResponse.json({ error: userMsg }, { status: 422 })
  }
}

import NextAuth from 'next-auth'
import { authConfig } from '@/lib/auth.config'
import { NextResponse } from 'next/server'
import type { NextAuthRequest } from 'next-auth'

// Use Edge-safe config only — no DB, no native modules
const { auth } = NextAuth(authConfig)

// Edge-safe in-process IP rate limiter — 300 requests/min per IP across all API routes.
// Provides DoS protection. In multi-instance deployments this is per-instance;
// for stricter global limits use Upstash (configured in checkRateLimitAsync).
const _apiStore = new Map<string, { count: number; resetAt: number }>()

function checkApiRateLimit(ip: string): boolean {
  const now   = Date.now()
  const entry = _apiStore.get(ip)
  if (!entry || now > entry.resetAt) {
    _apiStore.set(ip, { count: 1, resetAt: now + 60_000 })
    return true
  }
  if (entry.count >= 300) return false
  entry.count++
  return true
}

function buildSafeOrigins(): Set<string> {
  const origins = new Set<string>()
  for (const envKey of ['NEXTAUTH_URL', 'AUTH_URL', 'NEXT_PUBLIC_BASE_URL']) {
    const val = process.env[envKey]
    if (val) {
      try { origins.add(new URL(val).origin) } catch { /* invalid URL, skip */ }
    }
  }
  return origins
}

const SAFE_ORIGINS = buildSafeOrigins()

// In dev, any localhost port is a safe origin — the CSRF guard targets cross-domain
// requests, not different ports on the same machine.
const IS_DEV = process.env.NODE_ENV !== 'production'
const LOCALHOST_RE = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/

function isSafeOrigin(origin: string): boolean {
  if (IS_DEV && LOCALHOST_RE.test(origin)) return true
  return SAFE_ORIGINS.has(origin)
}

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

function isPublicPath(pathname: string): boolean {
  return (
    pathname.startsWith('/auth/') ||
    pathname.startsWith('/api/auth/') ||
    pathname === '/api/health' ||
    pathname === '/api/metrics/prometheus' ||
    pathname === '/favicon.ico' ||
    pathname.startsWith('/_next/')
  )
}


export default auth((req: NextAuthRequest) => {
  const { pathname } = req.nextUrl

  // Global IP rate limit for all API routes
  if (pathname.startsWith('/api/')) {
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
    if (!checkApiRateLimit(ip)) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
    }
  }

  // CSRF guard: non-auth API mutations must originate from a safe origin.
  // Missing Origin is also rejected — legitimate browser fetches always send it.
  // Falls back to Referer so same-origin SSR actions still work.
  if (pathname.startsWith('/api/') && !pathname.startsWith('/api/auth/') && MUTATING.has(req.method)) {
    const origin = req.headers.get('origin')
    const referer = req.headers.get('referer')
    let sourceOrigin: string | null = origin
    if (!sourceOrigin && referer) {
      try { sourceOrigin = new URL(referer).origin } catch { /* malformed referer */ }
    }
    if (!sourceOrigin || !isSafeOrigin(sourceOrigin)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }

  if (isPublicPath(pathname)) return NextResponse.next()

  if (!req.auth) {
    // API routes: return 401 — client fetch() must not silently get HTML
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return NextResponse.redirect(new URL('/auth/signin', req.url))
  }

  return NextResponse.next()
})

export const config = {
  matcher: [
    '/((?!api/health|_next/static|_next/image|favicon.ico).*)',
  ],
}

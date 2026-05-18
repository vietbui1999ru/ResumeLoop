import NextAuth from 'next-auth'
import { authConfig } from '@/lib/auth.config'
import { NextResponse } from 'next/server'
import type { NextAuthRequest } from 'next-auth'

// Use Edge-safe config only — no DB, no native modules
const { auth } = NextAuth(authConfig)

function buildSafeOrigins(): Set<string> {
  const origins = new Set<string>()
  // localhost only safe in non-production; production origin comes from env vars below
  if (process.env.NODE_ENV !== 'production') {
    origins.add('http://localhost:3000')
    origins.add('http://127.0.0.1:3000')
  }
  for (const envKey of ['NEXTAUTH_URL', 'AUTH_URL', 'NEXT_PUBLIC_BASE_URL']) {
    const val = process.env[envKey]
    if (val) {
      try { origins.add(new URL(val).origin) } catch { /* invalid URL, skip */ }
    }
  }
  return origins
}

const SAFE_ORIGINS = buildSafeOrigins()

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

const MOBILE_UA_RE = /android|iphone|ipad|ipod|blackberry|iemobile|opera mini|mobile/i

function isMobile(ua: string | null): boolean {
  if (!ua) return false
  return MOBILE_UA_RE.test(ua)
}

export default auth((req: NextAuthRequest) => {
  const { pathname } = req.nextUrl

  // Block mobile — desktop-only until mobile layout is implemented
  if (pathname !== '/not-supported' && !pathname.startsWith('/api/') && !pathname.startsWith('/_next/')) {
    const ua = req.headers.get('user-agent')
    if (isMobile(ua)) {
      return NextResponse.redirect(new URL('/not-supported', req.url))
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
    if (!sourceOrigin || !SAFE_ORIGINS.has(sourceOrigin)) {
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

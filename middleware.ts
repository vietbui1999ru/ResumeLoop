import NextAuth from 'next-auth'
import { authConfig } from '@/lib/auth.config'
import { NextResponse } from 'next/server'
import type { NextAuthRequest } from 'next-auth'

// Use Edge-safe config only — no DB, no native modules
const { auth } = NextAuth(authConfig)

function buildSafeOrigins(): Set<string> {
  const origins = new Set(['http://localhost:3000', 'http://127.0.0.1:3000'])
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
    pathname === '/favicon.ico' ||
    pathname.startsWith('/_next/')
  )
}

export default auth((req: NextAuthRequest) => {
  const { pathname } = req.nextUrl

  // CSRF guard: non-auth API mutations must come from a safe origin
  if (pathname.startsWith('/api/') && !pathname.startsWith('/api/auth/') && MUTATING.has(req.method)) {
    const origin = req.headers.get('origin')
    if (origin && !SAFE_ORIGINS.has(origin)) {
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
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}

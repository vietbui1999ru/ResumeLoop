import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const SAFE_ORIGINS = new Set([
  'http://localhost:3000',
  'http://127.0.0.1:3000',
])

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

export function middleware(request: NextRequest) {
  if (!MUTATING.has(request.method)) return NextResponse.next()

  const origin = request.headers.get('origin')

  // No Origin → curl / server-side fetch / SSR — allow.
  // Present Origin that isn't localhost → cross-origin browser request → block.
  if (origin && !SAFE_ORIGINS.has(origin)) {
    return NextResponse.json(
      { error: 'Forbidden' },
      { status: 403 }
    )
  }

  return NextResponse.next()
}

export const config = {
  matcher: '/api/:path*',
}

import { isCloud } from './app-mode'

export interface RateLimitResult {
  success: boolean
  remaining: number
  reset: number // unix ms
}

// ── Local: in-process sliding window ─────────────────────────────────────────
// Each key → sorted array of hit timestamps. O(n) but n is small per key.

const localStore = new Map<string, number[]>()

function localCheck(key: string, limit: number, windowMs: number): RateLimitResult {
  const now    = Date.now()
  const cutoff = now - windowMs
  const hits   = (localStore.get(key) ?? []).filter(t => t > cutoff)
  hits.push(now)
  localStore.set(key, hits)

  const remaining = Math.max(0, limit - hits.length)
  return {
    success:   hits.length <= limit,
    remaining,
    reset:     hits[0] + windowMs, // earliest hit expires first
  }
}

// ── Cloud: Upstash Redis sliding window ───────────────────────────────────────

let _upstashLimiter: unknown = null

async function getUpstashLimiter() {
  if (_upstashLimiter) return _upstashLimiter
  const { Ratelimit } = await import('@upstash/ratelimit')
  const { Redis }     = await import('@upstash/redis')
  const redis = new Redis({
    url:   process.env.UPSTASH_REDIS_REST_URL  ?? '',
    token: process.env.UPSTASH_REDIS_REST_TOKEN ?? '',
  })
  // 10 requests per 60 seconds for auth endpoints
  _upstashLimiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(10, '60 s'),
  })
  return _upstashLimiter
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Check rate limit for a key (e.g. `auth:login:${ip}` or `auth:login:${email}`).
 * limit + windowMs only apply in local mode (cloud uses Upstash config above).
 */
export async function checkRateLimit(
  key: string,
  limit = 10,
  windowMs = 60_000,
): Promise<RateLimitResult> {
  if (isCloud()) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const limiter = await getUpstashLimiter() as any
    const res = await limiter.limit(key)
    return {
      success:   res.success,
      remaining: res.remaining,
      reset:     res.reset,
    }
  }
  return localCheck(key, limit, windowMs)
}

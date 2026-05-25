import { isCloud } from './app-mode'
import { AUTH_UPSTASH_MAX, AUTH_UPSTASH_WINDOW } from './config'

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
  _upstashLimiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(AUTH_UPSTASH_MAX, AUTH_UPSTASH_WINDOW),
  })
  return _upstashLimiter
}

// ── Async API (auth routes — Upstash-aware) ───────────────────────────────────

/**
 * Async rate limit check for auth routes.
 * Uses Upstash Redis in cloud mode, in-process sliding window locally.
 * key: e.g. `auth:login:${ip}` or `auth:login:${email}`.
 * limit + windowMs only apply in local mode.
 */
export async function checkRateLimitAsync(
  key: string,
  limit = 10,
  windowMs = 60_000,
): Promise<RateLimitResult> {
  if (process.env.DISABLE_RATE_LIMIT === 'true') {
    return { success: true, remaining: limit, reset: Date.now() }
  }
  if (isCloud() && process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const limiter = await getUpstashLimiter() as any
      const res = await limiter.limit(key)
      return {
        success:   res.success,
        remaining: res.remaining,
        reset:     res.reset,
      }
    } catch (err) {
      console.error('[rate-limit] Upstash unavailable, falling back to local:', err)
    }
  }
  return localCheck(key, limit, windowMs)
}

// ── Sync API (simple per-IP fixed window, for settings/ai and logs routes) ───

const _store = new Map<string, { count: number; resetAt: number }>()
const DEFAULT_WINDOW = 60_000
const DEFAULT_MAX    = 10

/**
 * Synchronous per-IP fixed-window rate limiter.
 * Returns true if the request is allowed, false if rate-limited.
 */
export function checkRateLimit(ip: string, opts?: { window?: number; max?: number }): boolean {
  const windowMs = opts?.window ?? DEFAULT_WINDOW
  const max      = opts?.max    ?? DEFAULT_MAX
  const now      = Date.now()
  const entry    = _store.get(ip)
  if (!entry || now > entry.resetAt) {
    _store.set(ip, { count: 1, resetAt: now + windowMs })
    return true
  }
  if (entry.count >= max) return false
  entry.count++
  return true
}

export function extractIp(req: Request): string {
  // Use the first (leftmost) address from x-forwarded-for — the original client.
  const fwd = req.headers.get('x-forwarded-for')
  if (fwd) return fwd.split(',')[0].trim()
  return 'local'
}

/** Clear the sync rate-limit store. Only for use in tests. */
export function _resetForTesting() {
  _store.clear()
}

// ── Token bucket: per-user API rate limiting ──────────────────────────────────

interface Bucket { tokens: number; lastRefill: number }
const _buckets = new Map<string, Bucket>()

/**
 * Token bucket rate limiter. Returns true if request is allowed.
 * key:          e.g. `chat:${userId}` or `generate:${userId}`
 * maxTokens:    bucket capacity (burst ceiling)
 * refillPerMin: tokens added per minute (continuous)
 */
export function checkRateLimitBucket(
  key: string,
  maxTokens: number,
  refillPerMin: number,
): boolean {
  const now = Date.now()
  const b = _buckets.get(key) ?? { tokens: maxTokens, lastRefill: now }
  const elapsed = (now - b.lastRefill) / 60_000
  b.tokens = Math.min(maxTokens, b.tokens + elapsed * refillPerMin)
  b.lastRefill = now
  if (b.tokens < 1) {
    _buckets.set(key, b)
    return false
  }
  b.tokens -= 1
  _buckets.set(key, b)
  return true
}

/** Clear bucket store. Only for use in tests. */
export function _resetBucketsForTesting() {
  _buckets.clear()
}

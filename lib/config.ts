// Central config — pure scalars, no Node APIs, safe to import from client components.

// ── Resume domain hard limits ────────────────────────────────────────────────
// Must stay in sync with CLAUDE.md "Hard Limits" table and JSON schema in ai-reason.ts.
export const MAX_BULLET_CHARS        = 116
export const MAX_TAGLINE_CHARS       = 76
export const MAX_PERSONA_TITLE_CHARS = 60
// Word-boundary floor for tagline truncation: if lastIndexOf(' ') > this value,
// trim at the space; otherwise hard-truncate. Independent of MAX_PERSONA_TITLE_CHARS.
export const TAGLINE_WORD_BOUNDARY_MIN = 60
// Word-boundary floor for bullet truncation: same semantics as TAGLINE_WORD_BOUNDARY_MIN.
export const BULLET_WORD_BOUNDARY_MIN  = 90

// ── Demo account ─────────────────────────────────────────────────────────────
export const DEMO_TTL_MS = 12 * 60 * 60 * 1000  // 12 hours

// ── Ollama local inference ────────────────────────────────────────────────────
export const OLLAMA_DEFAULT_PORT     = '11434'
export const OLLAMA_DEFAULT_BASE_URL = `http://localhost:${OLLAMA_DEFAULT_PORT}/v1`

// ── SQLite database ───────────────────────────────────────────────────────────
// Overrideable via DB_PATH env — this is the filename used when DB_PATH is absent.
export const DEFAULT_DB_FILENAME = 'resume.db'

// ── Auth rate limits ──────────────────────────────────────────────────────────
// AUTH_UPSTASH_MAX / AUTH_UPSTASH_WINDOW: used by the Upstash sliding-window limiter.
// AUTH_WINDOW_MS: same window in milliseconds, used by the local in-process fallback.
export const AUTH_UPSTASH_MAX    = 10
export const AUTH_UPSTASH_WINDOW = '60 s' as const
export const AUTH_WINDOW_MS      = 60_000

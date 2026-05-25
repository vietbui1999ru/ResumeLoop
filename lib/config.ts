// Central config — pure scalars, no Node APIs, safe to import from client components.

// ── Resume domain hard limits ────────────────────────────────────────────────
// Must stay in sync with CLAUDE.md "Hard Limits" table and JSON schema in ai-reason.ts.
export const MAX_BULLET_CHARS        = 116
export const MAX_TAGLINE_CHARS       = 76
export const MAX_PERSONA_TITLE_CHARS = 60
// Minimum char position for a word-boundary split in tagline truncation.
// If lastIndexOf(' ') > this value the tagline is trimmed at the space; otherwise hard-truncated.
// Independent of MAX_PERSONA_TITLE_CHARS — do not conflate.
export const TAGLINE_WORD_BOUNDARY_MIN = 60

// ── Demo account ─────────────────────────────────────────────────────────────
export const DEMO_TTL_MS = 12 * 60 * 60 * 1000  // 12 hours

// ── Ollama local inference ────────────────────────────────────────────────────
export const OLLAMA_DEFAULT_PORT     = '11434'
export const OLLAMA_DEFAULT_BASE_URL = `http://localhost:${OLLAMA_DEFAULT_PORT}/v1`

// ── SQLite database ───────────────────────────────────────────────────────────
// Overrideable via DB_PATH env — this is the filename used when DB_PATH is absent.
export const DEFAULT_DB_FILENAME = 'resume.db'

// ── Auth rate limits (Upstash) ────────────────────────────────────────────────
// Must stay in sync with local sliding-window defaults in rate-limit.ts.
export const AUTH_UPSTASH_MAX    = 10
export const AUTH_UPSTASH_WINDOW = '60 s' as const

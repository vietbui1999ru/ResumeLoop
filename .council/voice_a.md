# anthropic/claude-sonnet-4-6

`★ Insight ─────────────────────────────────────`
The reviewer used a confidence threshold of 80% before flagging issues — this is a useful review discipline. It found one moderate-confidence concern (70%) about `getModel(userId)` vs `getModel(cfg)` that couldn't be confirmed without seeing `ai-client.ts`, but everything else checked out.
`─────────────────────────────────────────────────`

## Review result: No blocking issues

The agent did a thorough pass across all 12 ingest files. Here's what it verified and what it found:

### SSRF (CLEAR)
`/api/ingest/url/route.ts` lines 16–24 validate protocol, block all private IP ranges (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`), loopback (`127.0.0.1`, `::1`), and cloud metadata endpoints (`169.254.169.254`, `metadata.google.internal`). Fetch fallback is only called after this gate.

### Prompt injection (CLEAR)
All three extraction functions (`extract-paste.ts`, `extract-github.ts`, `extract-url.ts`) and `merge.ts` include system prompt instructions that bracket user-controlled data as untrusted. Not 100% foolproof, but appropriate defense-in-depth.

### Auth (CLEAR)
Every ingest route calls `auth()` at the top and returns 401 if no session. All DB queries are scoped to `userId` from the session. OnboardingGate is client-side UX only — APIs enforce auth independently.

### Firecrawl key (CLEAR)
Stored as `firecrawl_key:{userId}` in DB, never logged or returned to client. Error message sanitization uses regex to strip API key signals from raw errors before returning to caller.

### Merge correctness (CLEAR)
Merge is read-only — it reads `done` sources and returns a merged object. The actual DB write happens at `/api/profiles` (atomic). No transaction needed for the merge step.

---

### One flag (moderate confidence, ~70% — not blocking)

**`getModel(userId)` vs `getModel(cfg)`** — All four extraction libs call `getActiveConfig(userId)` (and throw if missing), but then pass `userId` to `getModel()` rather than `cfg`. The design spec shows `getModel(cfg)`. The reviewer couldn't confirm whether this is a bug or intentional without seeing `lib/ai-client.ts`. If `getModel` looks up config internally from userId, it's just an extra round-trip; if it needs the config object directly, this is incorrect.

**Recommended**: Quickly check `lib/ai-client.ts` — if `getModel(userId)` does its own DB lookup, it's just wasteful. If it expects a config object, this is a real bug.

# Resume Feedback Raw Log

Format per entry:
```
## [date] [jd-filename] rate:X/3
**What went wrong**: ...
**Fix applied**: ...
**Root cause**: ...
**Should have done**: ...
```

Rating scale: 1 = bad (needed major rework), 2 = ok (minor fixes), 3 = good (accepted as-is)

---
<!-- entries appended below by capture-mistake -->

## [2026-07-07] planning-process (demo-hosting plan audit) rate:1/3
**What went wrong**: First-pass Opus plan for self-hosted demo contained six confirmed slops: (1) fabricated files/symbols (`lib/workspace/onboard.ts`, `import-cv.ts`, `PingSchema`, `validateProvider`, `ExtractedProfileSchema`, `extractProfile` — none exist); (2) substituted `gemma3:4b` for the user's explicit gemma4 (repo default `gemma4:e2b`); (3) proposed new compose infra while `docker-compose.prod.yml`, `docs/deploy.md`, `lib/ollama-url.ts` already existed; (4) claimed `SpineDecisionSchema` enforces exact-3/closed-set — actually `min(1).max(6)` plain strings, constraints prompt-only; (5) misstated `DISABLE_RATE_LIMIT` scope (only `checkRateLimitAsync`, only throws in production, never touches sync/bucket limiters); (6) misattributed auth-removal claim to DEPRECATED.md (it's ADR 0001 §55) and claimed no new-arch jobs page exists (`app/(app)/workspace/page.tsx` does).
**Fix applied**: Full re-audit with parallel Explore agents verifying every claim against source; plan rebuilt on verified files only. Audit also surfaced two real bugs the slop had obscured: demo users have no AI provider configured (generation 400s), and `instrumentation.node.ts` cleanup scheduler is dead code (wrong filename).
**Root cause**: Planning agent cited files without reading them; orchestrator prompt embedded unverified claims (invented commit ref) that the agent amplified.
**Should have done**: Verify file existence before citing in plans; enumerate existing artifacts before proposing new ones; use user-named artifacts verbatim. Rules promoted to llm-wiki mistakes/global-prevention-rules.md §Planning/Subagents (structured entries: mistakes/2026-07-07-planning-*.md).

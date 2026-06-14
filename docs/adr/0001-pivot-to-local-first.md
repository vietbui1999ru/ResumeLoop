# ADR 0001 — Pivot ResumeLoop to a local-first, BYO-AI open-source tool

- **Status:** Accepted
- **Date:** 2026-06-10
- **Deciders:** Quoc-Viet Bui
- **Supersedes:** the cloud architecture (AWS ECS Fargate + ALB + Neon + NextAuth), frozen on branch `legacy/cloud-v1`, tag `v1.0-cloud-final`.

## Context

ResumeLoop today is a multi-tenant Next.js web app that runs AI generation server-side using stored, encrypted API keys (`lib/crypto.ts`), authenticates every request with NextAuth v5 (`lib/auth.ts`), and deploys to AWS ECS Fargate behind an ALB with a Neon Postgres / SQLite dual backend (`lib/db-adapter.ts`). See `CONTEXT.md` for the full invariant set.

Three forces drove a re-think:

1. **Cost.** AWS Fargate + ECS + ALB hosting cost does not justify the value for a personal/OSS tool.
2. **Security surface.** Per-user API-key storage, encryption-at-rest, OAuth/session handling, and strict multi-tenant `user_id` filtering are a large surface to own for what is effectively a single-operator tool.
3. **Economics of the brain.** Paying per-token via API keys duplicates spend users already have through subscriptions (Claude Code, Codex, Gemini CLI, opencode). The "brain" should be the user's own subscription CLI, not a metered key.

Two reference implementations informed the design:

- **`~/repos/resume-gen`** — the strict generation harness: `buildv2.js` (pure-JS `docx`, no LibreOffice), `master_resume_data.json` single source of truth, deterministic char/verb/fit validation. This is the engine we keep.
- **`~/repos/career-ops`** — a proven (Wired/Business-Insider-featured, 740+ evals) **local-first, no-DB, no-API-key** model: markdown files are the database, the AI CLI is the brain via context injection, and a read-only Go/Bubble Tea TUI renders the funnel. This is the distribution and data model we adopt (re-implemented in TS).

The goal: keep the **rich local web UI** ResumeLoop users like (profile building, tracking, fit scoring, document generation) while removing keys, cost, and auth, and making the tool open-source and installable by anyone.

## Decision

We re-platform ResumeLoop as a **local-first, single-user, BYO-AI** tool distributed on npm, while keeping `resumeloop.me` alive as a free hosted demo. Eleven load-bearing decisions:

### 1. Brain ↔ UI wiring — local server shells out to the user's CLI
A locally-run Next.js server (bound to `127.0.0.1`) invokes the user's chosen AI CLI in headless/print mode via a **provider adapter**: `claude -p`, `codex exec`, `gemini -p`, `opencode run`. The adapter sends a prompt + schema contract and parses stdout. `lib/ai-reason.ts` is refactored from "call Anthropic with a key" into "drive the configured provider." The existing pipeline already shells to build scripts via `child_process.spawn` (`lib/generate-pipeline.ts`), so the process model is familiar.

### 2. State model — files canonical + rebuildable SQLite index
Markdown/JSON files are the source of truth and live in a user-owned, git-trackable workspace:

```
data/
  profile.json        # master_resume_data.json, reborn — the single source of truth
  jobs/*.md           # JD + frontmatter (Action: 0–6, visa, apply_url, clipped_at)
  evaluations/*.md    # fit %, score, outreach brief
  resumes/            # generated .docx / .pdf
```

A **rebuildable** SQLite database at `.cache/index.db` indexes those files so the web UI keeps fast queries and the fluid feel. The SQLite half of the existing `DbAdapter` is repurposed as this index; the Neon Postgres half is removed.

### 3. Output contract — universal fenced-JSON + tolerant parse + one retry
Every structured prompt ends with an instruction to "return ONLY a ` ```json ` block matching `<schema>`." The adapter extracts the last fenced JSON block, validates with Zod (reusing the schemas landed in issue #71 step 4), and retries once with the validation error on failure. Where a CLI offers native structured output (`claude --output-format json` → `.result`), the adapter uses it as a fast-path. No CLI is excluded; Claude simply runs cleaner.

### 4. Hosted demo — live, on a self-hosted local model
`resumeloop.me` stays live as a free demo to let people try the flow and to track traffic. It produces AI output via a **self-hosted small model** (ollama on the homelab/VPS), reached through the **same provider adapter** using its `http` (OpenAI-compatible) transport. No cloud key, no per-token cost. Neon is retired; traffic analytics move to a privacy-friendly tool (Plausible/Umami). The demo uses anonymous ephemeral sessions — no accounts, no PII.

### 5. Generation engine — `docx` npm + Playwright PDF; LibreOffice removed
The ATS `.docx` is produced by `resume-gen`'s `buildv2.js` path (pure-JS `docx` package, carrying the strict harness: `T()`/`TL()` char limits, verb-uniqueness, fit gate). A second, typographically polished PDF is produced via a Playwright HTML→PDF template (adapted from `career-ops`'s `generate-pdf.mjs`). **LibreOffice is dropped entirely** — it was a ~400MB system dependency that wrecked the local-install story.

### 6. Auth — NextAuth deleted; localhost is the trust boundary
The local app binds `127.0.0.1`, is single-user, and has no login: the OS account is the trust boundary. `lib/auth.ts`, the middleware auth layer, the `user_id` multi-tenancy filtering, and `lib/crypto.ts` (API-key encryption) are all removed. The demo uses an anonymous ephemeral session cookie. LAN/remote exposure becomes the user's reverse-proxy concern, not ours.

### 7. TUI — Ink (TypeScript), focused scope
An **optional** terminal UI built with Ink (React for the terminal) so it shares Zod schemas, types, and the file/index layer with the web app — one toolchain, no duplicated parsing. Scope: the `career-ops`-style onboarding Q&A, a read-only pipeline dashboard (funnel/metrics), and quick status bumps (`Action: 0→6`). Heavy editing and resume preview stay in the web UI. (We explicitly reject a Go/Bubble Tea port to avoid a second toolchain, and full web-parity to keep the TUI optional.)

### 8. Onboarding — hybrid: deterministic setup, then AI-assisted import
Phase 1 is a deterministic wizard that needs no AI: detect installed CLIs (`which claude/codex/gemini/opencode`), let the user pick a provider, validate it with a test spawn, and capture name/targets/location into `profile.json`. Phase 2, once the brain is live, offers `career-ops`-style AI ingestion: paste a CV / LinkedIn / JD and the adapter extracts and populates `experience[]` / `projects[]` / `skills{}` for the user to confirm. This resolves the chicken-and-egg of "can't use the brain before picking the brain."

### 9. Engine vs data — a hard split for open-sourcing
The OSS repo ships **only the generic engine**: validation mechanics, the role-track *schema*, the ATS keyword-bank *schema*, and the DOCX/PDF renderers. **All personal data** — profile, role-track picks, keyword banks, verb-conflict map — lives in the user's `data/` workspace, seeded from blank templates and bootstrapped by the AI during onboarding. The maintainer's real data (the existing Viet-specific `CLAUDE.md` harness tables, `master_resume_data.json`) lives in a private workspace / the `legacy/cloud-v1` branch and never ships in the public repo. No one forks a "Viet clone."

### 10. Deprecation — freeze cloud on a branch, build on main
Cut `legacy/cloud-v1` and an annotated tag `v1.0-cloud-final` from the current main; this is frozen and never deleted. The local-first rewrite proceeds **on main**, which remains the default branch (no broken PR/issue/CI links). A `DEPRECATED.md` points to the legacy branch; this ADR records the rationale.

### 11. Distribution — npm CLI + `resumeloop init` workspace
Shipped as an npm package:

```
npm i -g resumeloop      # or: npx resumeloop
resumeloop init ~/career # scaffold a git-trackable data/ workspace
resumeloop               # boot the localhost web UI against it
resumeloop tui           # Ink terminal
```

The user's career data is their own private git repo (the `career-ops` model). Playwright auto-installs Chromium (~150MB) on first run; this is documented in the install guide.

## Consequences

**Positive**
- No cloud cost, no API keys, no encryption-at-rest, no OAuth/session/multi-tenancy surface.
- Genuinely open-source and installable: `npm i -g resumeloop` with no LibreOffice/system deps.
- Files-canonical state is portable, git-trackable, inspectable, and natively readable by the BYO-CLI brain.
- One provider abstraction serves local CLIs, the hosted demo, and local ollama users — a single seam to test.
- Reuses the strongest existing assets: the generation pipeline shape, the shared Zod schemas (issue #71), and the validation harness.

**Negative / risks**
- **Provider heterogeneity is the riskiest surface.** Each CLI's headless flags, JSON reliability, and exit semantics differ. Requires a `providers.yml` command/capability registry (reference: `career-ops`'s `AGENTS.md`) and a per-CLI integration spike. Non-Claude CLIs will lean on the fenced-JSON-plus-retry fallback.
- **Demo homelab exposure** is a public attack surface: edge rate-limiting + reverse proxy required; never expose ollama directly. Tracked as its own security task.
- **Output quality of the demo's small model** is below the CLIs users run locally, so the demo somewhat undersells the tool. Mitigate with clear "run it for real locally" framing.
- Large deletion/refactor: `lib/auth.ts`, `lib/crypto.ts`, the Neon adapter path, and `user_id` filtering all come out; `lib/ai-reason.ts` is rewritten. Incremental on main, not greenfield.

## Migration sequencing (tracer-bullet first)

The thinnest vertical slice that proves the spine before any large rewrite:

> `resumeloop init` → configure one provider (claude) → paste one JD → fenced-JSON fit-score round-trips through the adapter → render one ATS `.docx`. No TUI, no demo, no multi-provider.

If that round-trip is clean, every remaining decision is fill-in. Detailed slices are tracked as issues (see `/to-issues` output following this ADR).

## Alternatives considered

- **Context-injection framework (pure career-ops model)** — drop the app-as-brain, ship `CLAUDE.md`/command files, web UI becomes a read-only viewer. Rejected: loses the fluid interactive web UI that is ResumeLoop's differentiator.
- **MCP server** — expose data/tools over MCP for the user's agent. Rejected for v1: requires users to wire MCP and excludes non-MCP CLIs; revisit as an additional transport later.
- **Local OpenAI-compatible HTTP only** — simplest code path but excludes subscription CLIs (Claude Code, Codex) that don't expose an OpenAI server. Kept as one transport (`http`), not the only one.
- **Capability tiers (structured vs chat providers)** — rejected in favor of a universal fenced-JSON floor so no CLI is second-class.
- **Keep LibreOffice for DOCX→PDF fidelity** — rejected: the system-dependency weight defeats the local-install goal; Playwright HTML→PDF covers the "pretty" need.
- **Docker distribution** — rejected for v1: a container cannot easily reach the host-installed AI CLIs, breaking the spawn-CLI keystone.

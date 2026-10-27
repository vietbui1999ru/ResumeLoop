---
status: draft
branch: feat/web-out
---
# SPEC: Remove the Next.js web UI, the cloud stack and the SDK-path features (ADR 0002 step 1)

## Objective
Delete everything that is not part of the local-first engine or the CLI, as ADR 0002 decision 6 requires. The deleted code stays recoverable from the tag `v1.1-web-final`.

**Kept**
- The import closure of `bin/resumeloop.ts`: `lib/providers/*`, `lib/workspace/*`, `lib/{actions,jd-parser,pdf-render,config}.ts`.
- The runtime files the engine reads: `pipeline/buildv2.js`, `pipeline/master_resume_data.json`, `config/providers.yml`.
- The generation harness in `harness/` and `lib/bullets-validate.ts`, which encode the engine's hard rules.

**Deleted**
- `app/`, `components/`, `contexts/`, `hooks/`, `middleware.ts`, `e2e/`.
- Every other `lib/` module: auth, DB, demo, cloud, the AI SDK path, outreach, cover letter, chat and ingest.
- The Next.js, Tailwind and Playwright-web config.
- Docker and `infra/`.
- The personal data in `docs/reference/` and the generation logs in `logs/`.
- The dependencies that only those files used.

**Moved:** cloud-era and web-era docs go to `docs/legacy/`.

Afterwards, running `resumeloop` with no arguments prints usage instead of booting a web server.

**Success:** the CLI works, the remaining tests pass, the typecheck is clean, `npm audit --omit=dev` reports nothing at any level, and CI runs only the jobs that still apply.

## Acceptance Criteria
- AC-1: The tag `v1.1-web-final` exists on origin and contains the web app as it was before deletion
  verify: `/opt/homebrew/bin/git ls-remote --exit-code --tags origin v1.1-web-final && /opt/homebrew/bin/git cat-file -e 'v1.1-web-final:app/(app)/jobs/page.tsx'`
- AC-2: The web UI directories and their config are gone
  verify: `for p in app components contexts hooks e2e public middleware.ts next.config.mjs next-env.d.ts tailwind.config.ts postcss.config.mjs playwright.config.ts global.d.ts test-mocks; do test ! -e "$p" || exit 1; done`
- AC-3: `lib/` holds only the engine keep set
  verify: `test -z "$(/opt/homebrew/bin/git ls-files lib | /usr/bin/grep -vE '^lib/(providers|workspace)/|^lib/(actions|jd-parser|pdf-render|config|bullets-validate)(\.test)?\.ts$')"`
- AC-4: No kept source imports a web, cloud or model-SDK package
  verify: `! /usr/bin/grep -rEn "from ['\"](next(/[^'\"]*)?|next-auth[^'\"]*|ai|@ai-sdk/[^'\"]*|openai|@anthropic-ai/sdk|@neondatabase/[^'\"]*|@aws-sdk/[^'\"]*|@upstash/[^'\"]*|resend|bcryptjs|@mendable/firecrawl-js|react(-dom)?)['\"]" lib bin`
- AC-5: package.json no longer declares the removed dependencies
  verify: `node -e 'const p=require("./package.json");const d={...p.dependencies,...p.devDependencies};const bad=["next","next-auth","ai","openai","@anthropic-ai/sdk","@neondatabase/serverless","resend","bcryptjs","@mendable/firecrawl-js","react","react-dom","tailwindcss","eslint-config-next","@playwright/test"].filter(k=>k in d).concat(Object.keys(d).filter(k=>/^@(ai-sdk|aws-sdk|upstash)\//.test(k)));if(bad.length){console.error(bad);process.exit(1)}'`
- AC-6: The project typechecks
  verify: `npx tsc --noEmit`
- AC-7: The remaining unit tests pass
  verify: `npm test`
  baseline: pass
- AC-8: Production dependencies have no known vulnerabilities at any severity
  verify: `npm audit --omit=dev`
- AC-9: `resumeloop` with no arguments prints usage and exits 0 without starting a server
  verify: `npx tsx bin/resumeloop.ts | /usr/bin/grep -q 'usage' && ! /usr/bin/grep -qE 'next (dev|start)|waitForHealth|/api/health' bin/resumeloop.ts`
- AC-10: An unknown subcommand prints usage and exits non-zero (no longer treated as a directory to boot)
  verify: `! npx tsx bin/resumeloop.ts not-a-command`
- AC-11: The CLI still creates and indexes a workspace end to end
  verify: `d=$(mktemp -d) && npx tsx bin/resumeloop.ts init "$d" && npx tsx bin/resumeloop.ts reindex "$d" && test -f "$d/.cache/index.db"`
- AC-12: Lint runs without the Next.js ESLint config
  verify: `npm run lint && ! /usr/bin/grep -q 'next' .eslintrc.json`
- AC-13: CI no longer builds Next.js, a Docker image or web E2E, and the deploy workflow is gone
  verify: `! /usr/bin/grep -qE 'npm run build|test:e2e|docker|playwright install' .github/workflows/ci.yml && test ! -e .github/workflows/deploy.yml`
- AC-14: Docker and the cloud infrastructure are gone
  verify: `for p in Dockerfile .dockerignore docker-compose.yml docker-compose.prod.yml .env.prod.example infra reset-db.sh; do test ! -e "$p" || exit 1; done`
- AC-15: Personal data and generation logs are no longer tracked
  verify: `test -z "$(/opt/homebrew/bin/git ls-files docs/reference logs)"`
- AC-16: Cloud-era and web-era docs live under docs/legacy/, and the current docs set is only the agent guides, ADRs, specs, architecture and testing
  verify: `for f in aws-maintenance manual-setup observability deploy database demo-hosting ai-providers features ingest scan-and-reset action-status hero-page-plan; do test ! -e "docs/$f.md" && test -e "docs/legacy/$f.md" || exit 1; done`
- AC-17: The README describes the CLI install and commands, not a web UI
  verify: manual - the prose needs a human read
- AC-18: CLAUDE.md drops the web-only sections (routes, the `user_id` and auth error rows) and keeps the engine rules
  verify: manual - an editorial judgement over a long guide

## Boundaries
### Always
- Create and push `v1.1-web-final` (pointing at the `main` commit this branch starts from) before the first deletion commit
- Delete in coherent commits (web UI, lib, deps/config, infra, docs) so the history can be read and reverted in pieces
- Run `~/dotfiles/scripts/ac-run check SPEC.md` and `~/dotfiles/scripts/floor-guard` before claiming done
### Ask first
- Deleting anything in the keep set, `harness/`, `pipeline/`, `config/` or `.github/workflows/claude.yml`
- Adding any new dependency (beyond the typescript-eslint packages the lint switch needs)
- Behaviour changes to existing CLI commands (`init`, `onboard`, `import`, `generate`, `reindex`)
### Never
- Rewrite git history, force-push, or delete the `legacy/cloud-v1` branch or any `archive/*` tag
- Edit a `verify:` line or a kept test to make a check pass
- Add the engine facade, `resumeloop add` or any desktop code (later specs)

## Open Questions
- Does `harness/` (validate.js plus its own package.json) stay? Default: keep. It enforces the hard limits CLAUDE.md calls non-negotiable. Wiring it into the CLI belongs to the engine facade spec.
- Does `lib/bullets-validate.ts`, which the CLI doesn't reach, stay? Default: keep, with its test (verb uniqueness and the em-dash ban are engine rules). Delete `fit-scorer.ts`, because the spine supplies `fitPct`.
- What replaces linting? Default: ESLint 8 with `@typescript-eslint/recommended` over `lib/` and `bin/`, with `npm run lint` running `eslint lib bin`. Alternative: drop ESLint and rely on `tsc` alone.
- How should the tsconfig change? Default: remove the `next` plugin and `jsx: preserve`, and set `module`/`moduleResolution` to `NodeNext` only if `tsx` and vitest still resolve imports (otherwise keep `bundler`). The `@/*` path alias stays only if kept code uses it.
- What happens to `templates/*.docx` and `templates/PREJOBINPUT.md`? Default: delete. They are LibreOffice-era and web-era inputs, the PDF template is inline in `lib/pdf-render.ts`, and `buildv2.js` produces the DOCX.
- What happens to the root clutter (`CLAUDE.original.md`, `TLDR.md`, `agents/AGENT.md`, `JobData/Jobs`, `jobs/.gitkeep`, `.claude/skills/generate-resume/`)? Default: delete `CLAUDE.original.md`, `JobData/` and `jobs/` (workspace data belongs in the user's `data/`), and leave the rest for a separate tidy pass.
- What about `.github/workflows/aislop.yml`, which has failed at startup since 2026-07-26? Default: delete it. It is dead, and diagnosing it is out of scope.
- What does `docs/superpowers/` (cloud-era plans and specs) become? Default: move it whole to `docs/legacy/superpowers/`, except the apply-assist spec, which lives on its own branch.
- What becomes of the `resumeloop.me` domain and the homelab demo box? Default: out of scope for the repo. ADR 0002 retires them, and the user handles DNS and hosting.

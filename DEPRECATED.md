# Cloud architecture — deprecated

As of 2026-06-10, ResumeLoop is pivoting from a hosted, multi-tenant cloud web app to a **local-first, bring-your-own-AI, open-source** tool. See the full rationale and decisions in [`docs/adr/0001-pivot-to-local-first.md`](docs/adr/0001-pivot-to-local-first.md).

## Where the cloud version lives

The final cloud build (AWS ECS Fargate + ALB + Neon Postgres + NextAuth v5, server-side API keys) is frozen and preserved:

- **Branch:** `legacy/cloud-v1`
- **Tag:** `v1.0-cloud-final`
- **Commit:** `14aa31a`

```bash
git checkout legacy/cloud-v1     # browse the cloud architecture
git checkout v1.0-cloud-final    # the exact final cloud commit
```

This branch and tag are immutable — never force-pushed, never deleted.

## What changed

| Cloud (frozen) | Local-first (main, in progress) |
|---|---|
| AWS ECS Fargate + ALB hosting | Local Next.js bound to `127.0.0.1` |
| Server-side API keys (`@anthropic-ai/sdk`, ai-sdk) | BYO AI CLI (`claude`/`codex`/`gemini`/`opencode`) via a provider adapter |
| Neon Postgres / SQLite dual backend | Files canonical + rebuildable SQLite index |
| NextAuth v5 multi-tenant auth | No auth; OS account is the trust boundary |
| LibreOffice DOCX→PDF | `docx` npm (ATS) + Playwright HTML→PDF (pretty) |

`resumeloop.me` remains live as a free demo, served by a self-hosted local model through the same provider adapter.

Archived cloud-era operational docs (deploy, AWS maintenance, manual setup, AI providers, database, observability) are indexed in [`docs/legacy/`](docs/legacy/README.md).

The pivot is tracked as issues #77–#85 on the [issue tracker](https://github.com/vietbui1999ru/ResumeLoop/issues).

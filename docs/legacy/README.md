---
title: "Legacy — cloud-era docs (v1.0-cloud-final)"
type: index
description: "Index of documentation for the frozen cloud build of ResumeLoop, superseded by the local-first pivot (ADR 0001)."
tags: [legacy, deprecated, cloud, archive]
updated: 2026-06-12
---

# Legacy — cloud-era ResumeLoop (v1.0)

This page indexes documentation for the **frozen cloud build** of ResumeLoop: a hosted, multi-tenant Next.js app on **AWS ECS Fargate / App Runner + ALB**, **Neon Postgres**, **NextAuth v5**, and **server-side encrypted API keys**.

As of **2026-06-10**, ResumeLoop pivoted to a **local-first, bring-your-own-AI, single-user** tool. The decision of record is [ADR 0001](../adr/0001-pivot-to-local-first.md); the change summary is [`DEPRECATED.md`](../../DEPRECATED.md).

## Where the cloud version lives

The cloud build is preserved immutably — never force-pushed, never deleted:

- **Branch:** `legacy/cloud-v1`
- **Tag:** `v1.0-cloud-final`
- **Commit:** `14aa31a`

```bash
git checkout legacy/cloud-v1     # browse the cloud architecture
git checkout v1.0-cloud-final    # the exact final cloud commit
```

## Cloud-era documents

These docs remain in `docs/` with a deprecation banner at the top. They describe the cloud build and **do not apply** to local-first ResumeLoop.

| Doc | What it covered | Local-first replacement |
|---|---|---|
| [`deploy.md`](../deploy.md) | Docker + AWS / homelab deployment | Run from source / `resumeloop` npm CLI — [README](../../README.md) |
| [`aws-maintenance.md`](../aws-maintenance.md) | App Runner ops, scaling, secrets rotation | None — no AWS footprint |
| [`manual-setup.md`](../manual-setup.md) | Platform credentials, keys, secrets checklist | None — no keys/accounts; onboarding wizard |
| [`ai-providers.md`](../ai-providers.md) | Provider config via stored API keys | Provider adapter over your AI CLI — [architecture](../architecture.md) |
| [`database.md`](../database.md) | Dual SQLite + Neon Postgres (DB as source of truth) | Files canonical + rebuildable SQLite index — [CONTEXT.md](../../CONTEXT.md) |
| [`observability.md`](../observability.md) | Prometheus / Grafana / Tempo / OTEL stack | None per-install; edge analytics for the demo |

## What changed (summary)

| Cloud (frozen) | Local-first (main) |
|---|---|
| AWS ECS Fargate + ALB hosting | Local Next.js bound to `127.0.0.1` |
| Server-side encrypted API keys | BYO AI CLI via a provider adapter |
| Neon Postgres / SQLite dual backend | Files canonical + rebuildable SQLite index |
| NextAuth v5 multi-tenant auth | No auth; OS account is the trust boundary |
| LibreOffice DOCX→PDF | `docx` npm (ATS) + Playwright HTML→PDF (pretty) |
| Prometheus/Grafana/Tempo/OTEL | No per-install telemetry; edge analytics for demo |

## Current docs

- [README](../../README.md) — what local-first ResumeLoop is and how to run it
- [CONTEXT.md](../../CONTEXT.md) — vocabulary + architectural invariants
- [TLDR.md](../../TLDR.md) — one-screen overview
- [architecture.md](../architecture.md) — full local-first architecture
- [ADR 0001](../adr/0001-pivot-to-local-first.md) — the pivot decision

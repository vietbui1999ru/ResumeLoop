# ResumeLoop — TL;DR

Job hunt automation: paste a JD, get a tailored 1-page DOCX resume + outreach drafts in under a minute.

## System layers

```
Profile ingestion
  GitHub handle / URL / paste text
    └─ lib/ingest/  (extract → merge → conflict-resolve)
         └─ /onboarding page → save to profiles table

Job intake
  Obsidian Web Clipper → jobs table (auto)
  Paste Job / Scan folder → jobs table (manual)
    └─ fit scoring + role-track detection (genai / systems / IT-track / sre)

Resume generation
  AI reason (lib/ai-reason.ts)  — select bullets from master_resume_data.json
    └─ buildv2.js               — assemble DOCX
         └─ LibreOffice          — convert to PDF
              └─ S3 / local disk — store outputs

Web UI (Next.js App Router)
  /jobs         — job table, batch generate, pipeline tracking
  /chat         — live bullets editor + GitHub context import
  /config       — profile variants, AI provider, skills
  /account      — contact info, work auth
  /onboarding   — profile ingestion wizard
```

## Key data

| File | Role |
|---|---|
| `pipeline/master_resume_data.json` | All bullets, projects, work experience, skills |
| `pipeline/buildv2.js` | DOCX engine — takes `{id, bullets}`, resolves metadata |
| `CLAUDE.md` | Candidate profile + hard constraints (agentic context) |

## Modes

| Mode | Storage | Auth |
|---|---|---|
| Local dev | SQLite | credentials |
| Docker | SQLite (bind-mount) | credentials |
| Cloud (ECS Fargate) | Neon Postgres | credentials + OAuth |

## Observability (self-hosted)

Traces → OTel Collector → Tempo · Metrics → Prometheus → Grafana
Config in `infra/` — `otel-collector.yml`, `tempo.yml`, `prometheus/prometheus.yml`

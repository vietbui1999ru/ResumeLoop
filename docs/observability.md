---
title: "Observability Stack"
description: "Prometheus, Grafana, Tempo, and OTEL instrumentation for ResumeLoop — setup, alert rules, and trace verification."
tags: [observability, prometheus, grafana, tempo, otel, alerting]
updated: 2026-05-21
---

# Observability Stack

> **⚠️ DEPRECATED — cloud-era doc.** The Prometheus/Grafana/Tempo/OTEL stack instrumented the frozen cloud build (preserved on `legacy/cloud-v1`, tag `v1.0-cloud-final`). Per-user local installs ship **no telemetry stack** — the app runs on `127.0.0.1`. The hosted demo may use a subset at the edge; privacy-friendly web analytics (Plausible/Umami) replace per-request tracing. See [`DEPRECATED.md`](../DEPRECATED.md) and [ADR 0001](adr/0001-pivot-to-local-first.md).

ResumeLoop's observability layer consists of four components running on a homelab Docker Compose stack, plus OTEL instrumentation in the Next.js app itself.

```
ECS (Next.js app)
  │
  ├── Metrics pull  ◄──── Prometheus scrapes /api/metrics/prometheus every 60s
  │                        (bearer token auth via credentials_file)
  │
  └── Traces push   ────► OTEL Collector (homelab, port 4318)
                               │  bearer token auth
                               ▼
                          Tempo (trace storage)
                               │
                               ▼
                          Grafana (dashboards + alerting)
                               │
                               ▼
                          Slack (alert notifications)
```

**Three signal types:**

| Signal | Transport | Tool |
|---|---|---|
| Metrics | Pull (Prometheus scrapes ECS) | Prometheus → Grafana |
| Traces | Push (ECS → OTEL Collector) | Tempo → Grafana |
| Alerts | Rule evaluation over metrics | Grafana Alerting → Slack |

---

## Prerequisites

- Docker and Docker Compose on the homelab host
- Homelab has a public IP with port **4318** forwarded for OTEL trace ingestion
- Grafana accessible via Tailscale (port 3000, not exposed to public internet)
- A Slack webhook URL for alert notifications
- AWS Secrets Manager access (for the OTEL bearer token on ECS)

---

## Service Versions

| Service | Image |
|---|---|
| Prometheus | `prom/prometheus:v2.51.0` |
| Grafana | `grafana/grafana:10.4.0` |
| Tempo | `grafana/tempo:2.4.0` |
| OTEL Collector | `otel/opentelemetry-collector-contrib:0.100.0` |

---

## Starting the Stack

```bash
# Copy and fill in secrets
cp .env.homelab.example .env.homelab

# Create the metrics token file (must match METRICS_TOKEN on ECS)
mkdir -p secrets
echo -n "YOUR_METRICS_TOKEN" > secrets/metrics_token
chmod 600 secrets/metrics_token

# Start all four services
docker compose -f infra/docker-compose.homelab.yml --env-file .env.homelab up -d
```

**Required secrets in `.env.homelab`:**

| Variable | Purpose |
|---|---|
| `OTEL_BEARER_TOKEN` | Bearer token the OTEL Collector validates on inbound trace pushes |
| `METRICS_TOKEN` | Bearer token Prometheus uses to scrape `/api/metrics/prometheus` on ECS |
| `GRAFANA_ADMIN_PASSWORD` | Grafana admin login |
| `SLACK_WEBHOOK_URL` | Slack incoming webhook URL |

Generate random tokens: `openssl rand -hex 32`

The `secrets/` directory and `.env.homelab` are gitignored — never commit them.

---

## Verifying the Stack

After `up -d`, wait ~15 seconds, then:

```bash
# All four services should show "running"
docker compose -f infra/docker-compose.homelab.yml ps

# Prometheus is scraping ECS
curl -s http://localhost:9090/api/v1/targets | python3 -m json.tool | grep '"health"'
# Expected: "health": "up"

# Tempo is ready
curl -s http://localhost:3200/ready
# Expected: ready

# OTEL Collector rejects unauthenticated requests
curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:4318/v1/traces \
  -H "Content-Type: application/json" -d '{}'
# Expected: 401
```

Then open Grafana at `http://localhost:3000` (or via Tailscale):
- **Connections → Data sources**: both Prometheus and Tempo should be green
- **Alerting → Contact points**: `slack-resumeloop` should appear
- **Alerting → Alert rules**: three rules in folder `ResumeLoop`

---

## Alert Rules

Three alert rules fire to the `slack-resumeloop` contact point.

### AppDown

Fires when Prometheus cannot reach the ECS metrics endpoint.

- **Metric:** `resumeloop_up < 1`
- **For:** 2 minutes (prevents flapping on transient network errors)
- **Severity:** critical
- **noDataState:** Alerting (treats missing scrape as down)

### GenerationFailureRate

Fires when fewer than 80% of generation runs produce a DOCX file.

- **Metric:** `resumeloop_outputs_with_docx_total / resumeloop_outputs_total < 0.8`
- **Guard:** only fires if `resumeloop_outputs_total > 0` (prevents 0/0 division alert on fresh deploy)
- **For:** 5 minutes
- **Severity:** warning

### TokenSpike

Fires when cumulative AI token usage exceeds 100,000 tokens.

- **Metric:** `resumeloop_ai_tokens_total > 100000`
- **For:** 0 minutes (fires immediately on first evaluation)
- **Severity:** warning
- **Use case:** detect runaway generation loops or abuse

---

## Grafana Provisioning

Grafana is fully provisioned from files at startup — UI changes do not persist across restarts.

| File | Purpose |
|---|---|
| `infra/grafana/provisioning/datasources/datasources.yml` | Prometheus + Tempo datasources with explicit UIDs |
| `infra/grafana/provisioning/dashboards/dashboards.yml` | Auto-loads `resumeloop-dashboard.json` from `/var/lib/grafana/dashboards` |
| `infra/grafana/provisioning/alerting/contact-points.yml` | Slack webhook contact point |
| `infra/grafana/provisioning/alerting/notification-policy.yml` | Routes all alerts to `slack-resumeloop` |
| `infra/grafana/provisioning/alerting/rules.yml` | Three alert rules |

**UIDs are explicit** (`prometheus-homelab`, `tempo-homelab`) so alert rules can reference datasources without depending on Grafana's auto-generated IDs. Do not change these UIDs without also updating `rules.yml`.

---

## Tempo: Trace-to-Metric Generation

Tempo's `metrics_generator` block emits RED metrics (Rate, Error, Duration) from traces into Prometheus via remote write. This gives you span-duration-based alerting without adding a histogram to the app.

Block retention: 72 hours. Extend in `infra/tempo.yml` → `compactor.compaction.block_retention` for longer trace history.

---

## OTEL Instrumentation (Next.js)

The Next.js app registers OTEL via `instrumentation.ts` at the project root.

```typescript
// instrumentation.ts
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { registerOTel } = await import('@vercel/otel')
    registerOTel({ serviceName: 'resumeloop' })
  }
}
```

The `NEXT_RUNTIME === 'nodejs'` guard prevents OTEL from loading in the Edge runtime, which does not support Node.js APIs.

**Required environment variables on ECS:**

| Variable | Value |
|---|---|
| `OTEL_EXPORTER_OTLP_ENDPOINT` | `http://<homelab-public-ip>:4318` |
| `OTEL_EXPORTER_OTLP_PROTOCOL` | `http/protobuf` |
| `OTEL_EXPORTER_OTLP_HEADERS` | `Authorization=Bearer <OTEL_BEARER_TOKEN>` (from Secrets Manager) |

The `OTEL_EXPORTER_OTLP_HEADERS` value must be the full header string (`Authorization=Bearer …`), not just the token. Store this in Secrets Manager:

```bash
aws secretsmanager create-secret \
  --name resumeloop/prod/OTEL_BEARER_TOKEN \
  --secret-string "Authorization=Bearer $(openssl rand -hex 32)" \
  --region us-east-1
```

Grant the ECS task role access to the secret, then add it to the `secrets` array in `infra/ecs-task-def.json`.

---

## Dynamic Public IP

The homelab has a dynamic public IP. When it changes:

1. Update `OTEL_EXPORTER_OTLP_ENDPOINT` in `infra/ecs-task-def.json`
2. Re-register the task definition: `aws ecs register-task-definition --cli-input-json file://infra/ecs-task-def.json`
3. Force a new ECS deployment: `aws ecs update-service --cluster resumeloop --service resumeloop --force-new-deployment`

Prometheus scrapes the API Gateway URL (`fh7gi2vfe2.execute-api.us-east-1.amazonaws.com`), which is stable — no change needed when the homelab IP changes.

---

## End-to-End Verification

After deploying the updated ECS task definition:

```bash
# Trigger a trace
curl -s https://resumeloop.me/api/health

# Check Collector received it
docker compose -f infra/docker-compose.homelab.yml logs otel-collector --tail 20
# Look for: "msg":"Traces" with "resource spans" > 0
```

In Grafana → Explore → Tempo:
- Query type: Search
- Service name: `resumeloop`
- Click **Run query** — a trace should appear within 30 seconds

Test Slack alerting: Grafana → Alerting → Contact points → `slack-resumeloop` → **Send test**.

---

## Related Pages

- [`docs/deploy.md`](deploy.md) — ECS task definition and deployment
- [`docs/aws-maintenance.md`](aws-maintenance.md) — AWS infrastructure maintenance

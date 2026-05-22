# Observability Stack Design — ResumeLoop

**Date:** 2026-05-21
**Approach:** Prometheus pull (metrics) + OTEL push (traces) side-by-side, Grafana Alerting → Slack

---

## Goals

- Add distributed tracing to surface slow LLM calls and failed generations
- Add Slack notifications for app-down, high error rate, slow generation
- Secure Grafana/Prometheus behind Tailscale (no public exposure)
- Keep existing Prometheus metrics pipeline intact

---

## Network Topology

```
ECS Fargate (Next.js app)
  ├─ OTLP traces (HTTP) ──→ homelab public IP:4318
  │                          └─ OTEL Collector (bearer token auth)
  │                               └─ forwards to Tempo :4317 (internal)
  └─ /api/metrics/prometheus ←── homelab Prometheus :9090 (pull, existing)

Homelab Docker Compose:
  otel-collector  :4318 (public — router port-forward required)
  prometheus      :9090 (127.0.0.1 only)
  grafana         :3000 (127.0.0.1 only)
  tempo           :3200/:4317 (internal only)

Laptop ──Tailscale──→ homelab :3000 (Grafana UI)
```

Only port 4318 is publicly exposed. Grafana and Prometheus are bound to `127.0.0.1`; Tailscale's virtual interface (`tailscale0`) allows laptop access without opening them to the internet.

---

## App-Side Changes (Next.js / ECS)

### New file: `instrumentation.ts` (project root)

```ts
import { registerOTel } from '@vercel/otel'

export function register() {
  registerOTel({ serviceName: 'resumeloop' })
}
```

Next.js 14 calls this file automatically before anything else. `@vercel/otel` wraps the OTEL SDK with Next.js-aware auto-instrumentation — no manual span creation needed.

Auto-instrumented out of the box:
- All HTTP route handlers (method, path, status, duration)
- All outgoing `fetch` calls (LLM API calls: Ollama, Claude, OpenAI)
- Next.js middleware and render spans

### New env vars on ECS task definition

```
OTEL_EXPORTER_OTLP_ENDPOINT=http://<homelab-public-ip>:4318
OTEL_EXPORTER_OTLP_HEADERS=Authorization=Bearer <token>
OTEL_EXPORTER_OTLP_PROTOCOL=http/protobuf
```

Token generated with: `openssl rand -hex 32`

---

## Homelab Docker Compose

File: `infra/docker-compose.homelab.yml`

### Services

**otel-collector** — public-facing trace receiver, forwards to Tempo
- Image: `otel/opentelemetry-collector-contrib:0.100.0`
- Port: `4318` (public)
- Config: `infra/otel-collector.yml`

**tempo** — trace storage, internal only
- Image: `grafana/tempo:2.4.0`
- Ports: `3200` (HTTP API), `4317` (gRPC OTLP) — internal only
- Retention: 72h
- Storage: local filesystem volume

**prometheus** — metrics pull, internal only
- Image: `prom/prometheus:v2.51.0`
- Port: `127.0.0.1:9090:9090`
- Config: existing `infra/prometheus/resumeloop-scrape.yml`

**grafana** — dashboards + alerting, Tailscale only
- Image: `grafana/grafana:10.4.0`
- Port: `127.0.0.1:3000:3000`
- Provisioned datasources and alert rules via files

### Config files

**`infra/otel-collector.yml`**
```yaml
extensions:
  bearertokenauth:
    token: "${OTEL_BEARER_TOKEN}"

receivers:
  otlp:
    protocols:
      http:
        endpoint: 0.0.0.0:4318
        auth:
          authenticator: bearertokenauth

exporters:
  otlp:
    endpoint: tempo:4317
    tls:
      insecure: true

service:
  extensions: [bearertokenauth]
  pipelines:
    traces:
      receivers: [otlp]
      exporters: [otlp]
```

**`infra/tempo.yml`**
```yaml
server:
  http_listen_port: 3200

distributor:
  receivers:
    otlp:
      protocols:
        grpc:

storage:
  trace:
    backend: local
    local:
      path: /var/tempo/blocks
    wal:
      path: /var/tempo/wal

compactor:
  compaction:
    block_retention: 72h
```

---

## Grafana Provisioning

All config as files under `infra/grafana/provisioning/` — loaded at Grafana startup.

### Datasources (`datasources/datasources.yml`)

```yaml
datasources:
  - name: Prometheus
    type: prometheus
    url: http://prometheus:9090
    isDefault: true
  - name: Tempo
    type: tempo
    url: http://tempo:3200
```

### Alert contact point (`alerting/contact-points.yml`)

```yaml
apiVersion: 1
contactPoints:
  - orgId: 1
    name: slack-resumeloop
    receivers:
      - uid: slack-main
        type: slack
        settings:
          url: "${SLACK_WEBHOOK_URL}"
          title: "ResumeLoop Alert"
          text: "{{ len .Alerts.Firing }} firing | {{ .CommonLabels.alertname }}"
```

### Alert rules (`alerting/rules.yml`)

Based on actual metrics exposed at `/api/metrics/prometheus`:

| Alert | Condition | Window | Meaning |
|---|---|---|---|
| `AppDown` | `resumeloop_up == 0` | 2m | Prometheus can't scrape — app is down |
| `GenerationFailureRate` | `resumeloop_outputs_with_docx_total / resumeloop_outputs_total < 0.8` | 5m | <80% of runs produce a DOCX (generation failures) |
| `TokenSpike` | `resumeloop_ai_tokens_total > 100000` | immediate | Cumulative AI token threshold — cost guard |

Note: duration-based alerts (slow LLM calls) will come from OTEL traces via Grafana Tempo metric generation, not Prometheus. Add those after OTEL is live.

---

## Secrets (`.env.homelab` on host, never committed)

```
OTEL_BEARER_TOKEN=<openssl rand -hex 32>
GRAFANA_ADMIN_PASSWORD=<strong password>
SLACK_WEBHOOK_URL=<from Slack app settings>
```

---

## Out of Scope

- TLS on port 4318 (no domain; token auth is sufficient for personal use)
- Grafana Cloud (homelab-local storage chosen)
- Alertmanager (Grafana Alerting is sufficient for single-app)
- Log aggregation (Loki) — add later if needed

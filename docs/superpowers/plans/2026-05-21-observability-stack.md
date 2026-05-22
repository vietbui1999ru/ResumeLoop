# Observability Stack Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up Prometheus + Grafana + Tempo + OTEL Collector on homelab Docker Compose, instrument the Next.js app with OTEL traces, and wire Grafana Alerting to Slack.

**Architecture:** Homelab runs four services in one compose file — Prometheus (metrics pull), Grafana (dashboards + alerting), Tempo (trace storage), and OTEL Collector (public-facing trace receiver). The Next.js app on ECS pushes OTLP traces to the Collector on the homelab's public IP; Grafana is only accessible via Tailscale. All secrets stay out of git in `.env.homelab` on the host.

**Tech Stack:** `grafana/grafana:10.4.0`, `prom/prometheus:v2.51.0`, `grafana/tempo:2.4.0`, `otel/opentelemetry-collector-contrib:0.100.0`, `@vercel/otel` (Next.js), AWS Secrets Manager (OTEL bearer token)

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `infra/prometheus/prometheus.yml` | Create | Full Prometheus config (replaces scrape-only snippet) |
| `infra/tempo.yml` | Create | Tempo trace storage config |
| `infra/otel-collector.yml` | Create | OTEL Collector — public receiver → Tempo |
| `infra/grafana/provisioning/datasources/datasources.yml` | Create | Auto-provision Prometheus + Tempo datasources |
| `infra/grafana/provisioning/dashboards/dashboards.yml` | Create | Auto-load existing resumeloop-dashboard.json |
| `infra/grafana/provisioning/alerting/contact-points.yml` | Create | Slack webhook contact point |
| `infra/grafana/provisioning/alerting/notification-policy.yml` | Create | Route all alerts to Slack |
| `infra/grafana/provisioning/alerting/rules.yml` | Create | 3 alert rules (AppDown, GenerationFailureRate, TokenSpike) |
| `infra/docker-compose.homelab.yml` | Create | 4-service homelab compose stack |
| `.env.homelab.example` | Create | Secrets template (safe to commit) |
| `instrumentation.ts` | Create | Next.js OTEL SDK registration (project root) |
| `infra/ecs-task-def.json` | Modify | Add OTEL env vars + new Secrets Manager ARN |
| `package.json` | Modify | Add `@vercel/otel` dependency |

---

## Task 1: Full Prometheus Config

The existing `infra/prometheus/resumeloop-scrape.yml` is a snippet (starts with `- job_name:`), not a complete `prometheus.yml`. Prometheus needs the full config file.

**Files:**
- Create: `infra/prometheus/prometheus.yml`

- [ ] **Step 1: Validate the existing scrape snippet**

```bash
cat infra/prometheus/resumeloop-scrape.yml
```

Expected: starts with `- job_name: resumeloop` (a list item, no global block).

- [ ] **Step 2: Create full prometheus.yml**

Create `infra/prometheus/prometheus.yml`:

```yaml
global:
  scrape_interval: 60s
  scrape_timeout: 15s
  evaluation_interval: 60s

scrape_configs:
  - job_name: resumeloop
    scheme: https
    metrics_path: /api/metrics/prometheus
    scrape_interval: 60s
    scrape_timeout: 15s

    authorization:
      type: Bearer
      credentials_file: /etc/prometheus/secrets/metrics_token

    static_configs:
      - targets:
          - fh7gi2vfe2.execute-api.us-east-1.amazonaws.com
        labels:
          env: production
          app: resumeloop

    tls_config:
      insecure_skip_verify: false
```

Note: `credentials_file` reads the token from a mounted file (safer than inline env var expansion in YAML). The token file is mounted in the compose step.

- [ ] **Step 3: Validate YAML syntax**

```bash
python3 -c "import yaml; yaml.safe_load(open('infra/prometheus/prometheus.yml'))" && echo "✓ valid"
```

Expected: `✓ valid`

- [ ] **Step 4: Commit**

```bash
git add infra/prometheus/prometheus.yml
git commit -m "feat(infra): add full prometheus.yml for homelab compose"
```

---

## Task 2: Tempo Config

Tempo stores traces locally. It listens on gRPC OTLP (4317) for inbound traces from the Collector and exposes an HTTP API (3200) for Grafana queries.

**Files:**
- Create: `infra/tempo.yml`

- [ ] **Step 1: Create tempo.yml**

Create `infra/tempo.yml`:

```yaml
server:
  http_listen_port: 3200

distributor:
  receivers:
    otlp:
      protocols:
        grpc:
          endpoint: 0.0.0.0:4317

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

metrics_generator:
  registry:
    external_labels:
      source: tempo
      app: resumeloop
  storage:
    path: /var/tempo/generator/wal
    remote_write:
      - url: http://prometheus:9090/api/v1/write
        send_exemplars: true

overrides:
  defaults:
    metrics_generator:
      processors: [service-graphs, span-metrics]
```

The `metrics_generator` block makes Tempo emit RED metrics (Rate, Error, Duration) from traces into Prometheus — this is how you'll get duration-based alerts later without a separate histogram in the app.

- [ ] **Step 2: Validate YAML**

```bash
python3 -c "import yaml; yaml.safe_load(open('infra/tempo.yml'))" && echo "✓ valid"
```

Expected: `✓ valid`

- [ ] **Step 3: Commit**

```bash
git add infra/tempo.yml
git commit -m "feat(infra): add tempo trace storage config with metrics generator"
```

---

## Task 3: OTEL Collector Config

The Collector sits between ECS (public internet) and Tempo (internal). It validates the bearer token and forwards traces. Only handles traces — metrics stay on the existing Prometheus pull path.

**Files:**
- Create: `infra/otel-collector.yml`

- [ ] **Step 1: Create otel-collector.yml**

Create `infra/otel-collector.yml`:

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

processors:
  batch:
    timeout: 5s
    send_batch_size: 512

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
      processors: [batch]
      exporters: [otlp]
```

The `batch` processor buffers spans before forwarding — reduces Tempo write load and handles ECS traffic bursts.

- [ ] **Step 2: Validate YAML**

```bash
python3 -c "import yaml; yaml.safe_load(open('infra/otel-collector.yml'))" && echo "✓ valid"
```

Expected: `✓ valid`

- [ ] **Step 3: Commit**

```bash
git add infra/otel-collector.yml
git commit -m "feat(infra): add otel-collector config with bearer token auth"
```

---

## Task 4: Grafana Datasource Provisioning

Provisioning files in `grafana/provisioning/` are loaded at Grafana startup. Changes made in the UI won't survive restarts — keep this file as the source of truth.

**Files:**
- Create: `infra/grafana/provisioning/datasources/datasources.yml`

- [ ] **Step 1: Create directory structure**

```bash
mkdir -p infra/grafana/provisioning/datasources
mkdir -p infra/grafana/provisioning/dashboards
mkdir -p infra/grafana/provisioning/alerting
```

Create `infra/grafana/provisioning/dashboards/dashboards.yml` so Grafana auto-loads the existing dashboard JSON:

```yaml
apiVersion: 1

providers:
  - name: resumeloop
    type: file
    disableDeletion: true
    updateIntervalSeconds: 60
    options:
      path: /var/lib/grafana/dashboards
```

- [ ] **Step 2: Create datasources.yml**

Create `infra/grafana/provisioning/datasources/datasources.yml`:

```yaml
apiVersion: 1

datasources:
  - name: Prometheus
    type: prometheus
    uid: prometheus-homelab
    url: http://prometheus:9090
    isDefault: true
    editable: false

  - name: Tempo
    type: tempo
    uid: tempo-homelab
    url: http://tempo:3200
    editable: false
    jsonData:
      tracesToLogsV2:
        customQuery: false
      serviceMap:
        datasourceUid: prometheus-homelab
      nodeGraph:
        enabled: true
```

UIDs (`prometheus-homelab`, `tempo-homelab`) are explicit so alert rules can reference them without depending on Grafana's auto-generated values.

- [ ] **Step 3: Validate YAML**

```bash
python3 -c "import yaml; yaml.safe_load(open('infra/grafana/provisioning/datasources/datasources.yml'))" && echo "✓ valid"
```

Expected: `✓ valid`

- [ ] **Step 4: Commit**

```bash
git add infra/grafana/
git commit -m "feat(infra): provision grafana datasources (prometheus + tempo)"
```

---

## Task 5: Grafana Alerting Provisioning

Three files: contact point (where to send), notification policy (how to route), alert rules (when to fire).

**Files:**
- Create: `infra/grafana/provisioning/alerting/contact-points.yml`
- Create: `infra/grafana/provisioning/alerting/notification-policy.yml`
- Create: `infra/grafana/provisioning/alerting/rules.yml`

- [ ] **Step 1: Create contact-points.yml**

Create `infra/grafana/provisioning/alerting/contact-points.yml`:

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
          title: |
            {{ if eq .Status "firing" }}🔴{{ else }}✅{{ end }} {{ .CommonLabels.alertname }}
          text: |
            {{ range .Alerts }}
            *Status:* {{ .Status }}
            *Summary:* {{ .Annotations.summary }}
            {{ end }}
        disableResolveMessage: false
```

- [ ] **Step 2: Create notification-policy.yml**

Create `infra/grafana/provisioning/alerting/notification-policy.yml`:

```yaml
apiVersion: 1

policies:
  - orgId: 1
    receiver: slack-resumeloop
    group_by: [alertname]
    group_wait: 30s
    group_interval: 5m
    repeat_interval: 4h
```

- [ ] **Step 3: Create rules.yml**

Create `infra/grafana/provisioning/alerting/rules.yml`:

```yaml
apiVersion: 1

groups:
  - orgId: 1
    name: resumeloop
    folder: ResumeLoop
    interval: 1m
    rules:

      - uid: resumeloop-app-down
        title: AppDown
        condition: C
        data:
          - refId: A
            datasourceUid: prometheus-homelab
            relativeTimeRange: { from: 300, to: 0 }
            model:
              expr: resumeloop_up
              instant: true
              refId: A
          - refId: C
            datasourceUid: "__expr__"
            model:
              type: math
              expression: "$A < 1"
              refId: C
        noDataState: Alerting
        execErrState: Alerting
        for: 2m
        annotations:
          summary: "ResumeLoop is unreachable — Prometheus cannot scrape the metrics endpoint"
        labels:
          severity: critical

      - uid: resumeloop-generation-failure-rate
        title: GenerationFailureRate
        condition: C
        data:
          - refId: A
            datasourceUid: prometheus-homelab
            relativeTimeRange: { from: 300, to: 0 }
            model:
              expr: resumeloop_outputs_with_docx_total / resumeloop_outputs_total
              instant: true
              refId: A
          - refId: B
            datasourceUid: prometheus-homelab
            relativeTimeRange: { from: 300, to: 0 }
            model:
              expr: resumeloop_outputs_total
              instant: true
              refId: B
          - refId: C
            datasourceUid: "__expr__"
            model:
              type: math
              # Only fire if ratio < 0.8 AND total > 0 (avoids 0/0 on fresh deploy)
              expression: "$A < 0.8 && $B > 0"
              refId: C
        noDataState: NoData
        execErrState: Error
        for: 5m
        annotations:
          summary: "Less than 80% of generation runs produced a DOCX — check AI provider or DOCX pipeline"
        labels:
          severity: warning

      - uid: resumeloop-token-spike
        title: TokenSpike
        condition: C
        data:
          - refId: A
            datasourceUid: prometheus-homelab
            relativeTimeRange: { from: 300, to: 0 }
            model:
              expr: resumeloop_ai_tokens_total
              instant: true
              refId: A
          - refId: C
            datasourceUid: "__expr__"
            model:
              type: math
              expression: "$A > 100000"
              refId: C
        noDataState: NoData
        execErrState: Error
        for: 0m
        annotations:
          summary: "Cumulative AI token usage exceeded 100k — check for runaway generation or abuse"
        labels:
          severity: warning
```

- [ ] **Step 4: Validate all three YAML files**

```bash
for f in infra/grafana/provisioning/alerting/*.yml; do
  python3 -c "import yaml; yaml.safe_load(open('$f'))" && echo "✓ $f"
done
```

Expected: three `✓` lines.

- [ ] **Step 5: Commit**

```bash
git add infra/grafana/provisioning/alerting/
git commit -m "feat(infra): provision grafana alerting — slack contact point + 3 alert rules"
```

---

## Task 6: Docker Compose Homelab Stack + Secrets Template

Wires all four services together. Secrets come from `.env.homelab` on the host (never committed).

**Files:**
- Create: `infra/docker-compose.homelab.yml`
- Create: `.env.homelab.example`

- [ ] **Step 1: Create secrets template**

Create `.env.homelab.example` at project root:

```bash
# Copy to .env.homelab and fill in values. Never commit .env.homelab.
# Generate OTEL_BEARER_TOKEN with: openssl rand -hex 32
# Generate METRICS_TOKEN with: openssl rand -hex 32 (same token as ECS METRICS_TOKEN)

OTEL_BEARER_TOKEN=
METRICS_TOKEN=
GRAFANA_ADMIN_PASSWORD=
SLACK_WEBHOOK_URL=
```

- [ ] **Step 2: Create docker-compose.homelab.yml**

Create `infra/docker-compose.homelab.yml`:

```yaml
# Homelab observability stack for ResumeLoop
# Start:  docker compose -f infra/docker-compose.homelab.yml --env-file .env.homelab up -d
# Stop:   docker compose -f infra/docker-compose.homelab.yml down
# Logs:   docker compose -f infra/docker-compose.homelab.yml logs -f

services:
  prometheus:
    image: prom/prometheus:v2.51.0
    restart: unless-stopped
    ports:
      - "127.0.0.1:9090:9090"
    volumes:
      - ./infra/prometheus/prometheus.yml:/etc/prometheus/prometheus.yml:ro
      - prometheus-data:/prometheus
      # Token file mount — create this on the host from METRICS_TOKEN
      - ./secrets/metrics_token:/etc/prometheus/secrets/metrics_token:ro
    command:
      - --config.file=/etc/prometheus/prometheus.yml
      - --storage.tsdb.retention.time=30d
      - --web.enable-remote-write-receiver

  grafana:
    image: grafana/grafana:10.4.0
    restart: unless-stopped
    ports:
      - "127.0.0.1:3000:3000"
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=${GRAFANA_ADMIN_PASSWORD}
      - GF_FEATURE_TOGGLES_ENABLE=traceqlEditor
      - SLACK_WEBHOOK_URL=${SLACK_WEBHOOK_URL}
    volumes:
      - grafana-data:/var/lib/grafana
      - ./infra/grafana/provisioning:/etc/grafana/provisioning:ro
      - ./infra/grafana/resumeloop-dashboard.json:/var/lib/grafana/dashboards/resumeloop.json:ro

  tempo:
    image: grafana/tempo:2.4.0
    restart: unless-stopped
    command: [-config.file=/etc/tempo.yml]
    volumes:
      - ./infra/tempo.yml:/etc/tempo.yml:ro
      - tempo-data:/var/tempo

  otel-collector:
    image: otel/opentelemetry-collector-contrib:0.100.0
    restart: unless-stopped
    ports:
      - "4318:4318"    # OTLP HTTP — forward this port on your router
    environment:
      - OTEL_BEARER_TOKEN=${OTEL_BEARER_TOKEN}
    volumes:
      - ./infra/otel-collector.yml:/etc/otel/config.yml:ro
    command: [--config=/etc/otel/config.yml]
    depends_on:
      - tempo

volumes:
  prometheus-data:
  grafana-data:
  tempo-data:
```

- [ ] **Step 3: Create the secrets directory and token file**

On the homelab host (not in git):

```bash
mkdir -p secrets
echo -n "YOUR_METRICS_TOKEN" > secrets/metrics_token
chmod 600 secrets/metrics_token
```

Add `secrets/` to `.gitignore`:

```bash
echo "secrets/" >> .gitignore
echo ".env.homelab" >> .gitignore
```

- [ ] **Step 4: Validate compose file**

```bash
docker compose -f infra/docker-compose.homelab.yml config --quiet && echo "✓ compose valid"
```

Expected: `✓ compose valid`

- [ ] **Step 5: Commit**

```bash
git add infra/docker-compose.homelab.yml .env.homelab.example .gitignore
git commit -m "feat(infra): add homelab docker compose stack (prometheus, grafana, tempo, otel-collector)"
```

---

## Task 7: Smoke Test Homelab Stack

Verify all four services come up and talk to each other before touching the app.

**Prerequisites:** `.env.homelab` filled in, `secrets/metrics_token` created, port 4318 forwarded on router.

- [ ] **Step 1: Start the stack**

```bash
docker compose -f infra/docker-compose.homelab.yml --env-file .env.homelab up -d
```

Wait 15 seconds, then:

```bash
docker compose -f infra/docker-compose.homelab.yml ps
```

Expected: all four services `running`.

- [ ] **Step 2: Verify Prometheus is scraping**

```bash
curl -s http://localhost:9090/api/v1/targets | python3 -m json.tool | grep '"health"'
```

Expected: `"health": "up"` for the resumeloop target.
If `"health": "down"`: check `secrets/metrics_token` content matches the `METRICS_TOKEN` env var on ECS.

- [ ] **Step 3: Verify Tempo is healthy**

```bash
curl -s http://localhost:3200/ready
```

Expected: `ready`

- [ ] **Step 4: Verify OTEL Collector rejects unauthenticated requests**

```bash
curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:4318/v1/traces \
  -H "Content-Type: application/json" -d '{}'
```

Expected: `401` (unauthorized — bearer token required).

- [ ] **Step 5: Open Grafana and verify datasources**

Navigate to `http://localhost:3000` (or via Tailscale IP).
Login: admin / your `GRAFANA_ADMIN_PASSWORD`.

Go to **Connections → Data sources**. Both `Prometheus` and `Tempo` should show green **Save & test** status.

Go to **Alerting → Contact points** — `slack-resumeloop` should be listed.
Go to **Alerting → Alert rules** — three rules in folder `ResumeLoop` should be visible.

- [ ] **Step 6: Commit smoke test notes (optional)**

```bash
git commit --allow-empty -m "chore: homelab stack smoke tested — all services healthy"
```

---

## Task 8: Next.js OTEL Instrumentation

Add `@vercel/otel` to the app. Next.js 14 auto-calls `instrumentation.ts` at startup.

**Files:**
- Create: `instrumentation.ts` (project root)
- Modify: `package.json`

- [ ] **Step 1: Install @vercel/otel**

```bash
npm install @vercel/otel
```

- [ ] **Step 2: Verify it installed**

```bash
node -e "require('@vercel/otel'); console.log('✓ @vercel/otel importable')"
```

Expected: `✓ @vercel/otel importable`

- [ ] **Step 3: Create instrumentation.ts**

Create `instrumentation.ts` at the project root:

```ts
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { registerOTel } = await import('@vercel/otel')
    registerOTel({
      serviceName: 'resumeloop',
    })
  }
}
```

The `process.env.NEXT_RUNTIME === 'nodejs'` guard prevents OTEL from loading in the Edge runtime (which doesn't support Node.js APIs). Without it, the app crashes on edge middleware.

- [ ] **Step 4: Verify Next.js picks up the file**

```bash
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318 \
OTEL_EXPORTER_OTLP_HEADERS="Authorization=Bearer test" \
OTEL_EXPORTER_OTLP_PROTOCOL=http/protobuf \
npm run build 2>&1 | grep -i "instrument\|otel\|telemetry" | head -10
```

Expected: no errors mentioning `instrumentation`. A clean build is sufficient — OTEL SDK doesn't log on build, only on startup.

- [ ] **Step 5: Test locally with dev server**

```bash
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318 \
OTEL_EXPORTER_OTLP_HEADERS="Authorization=Bearer YOUR_LOCAL_OTEL_BEARER_TOKEN" \
OTEL_EXPORTER_OTLP_PROTOCOL=http/protobuf \
npm run dev
```

In another terminal, make a request:

```bash
curl -s http://localhost:3000/api/health > /dev/null
```

Then check Grafana → Explore → Tempo. Select service `resumeloop`. Within 10 seconds a trace should appear for the health endpoint.

If no trace appears: check `docker compose logs otel-collector` for auth errors or connection refused.

- [ ] **Step 6: Commit**

```bash
git add instrumentation.ts package.json package-lock.json
git commit -m "feat(otel): add @vercel/otel instrumentation for Next.js tracing"
```

---

## Task 9: Add OTEL Secret to AWS + Update ECS Task Def

The OTEL bearer token is sensitive — goes into Secrets Manager, same pattern as existing secrets.

**Files:**
- Modify: `infra/ecs-task-def.json`

- [ ] **Step 1: Create the secret in Secrets Manager**

```bash
aws secretsmanager create-secret \
  --name resumeloop/prod/OTEL_BEARER_TOKEN \
  --secret-string "$(cat .env.homelab | grep OTEL_BEARER_TOKEN | cut -d= -f2)" \
  --region us-east-1
```

Note the ARN from the output — looks like:
`arn:aws:secretsmanager:us-east-1:985526967036:secret:resumeloop/prod/OTEL_BEARER_TOKEN-XXXXXX`

- [ ] **Step 2: Add OTEL env vars to ecs-task-def.json**

In `infra/ecs-task-def.json`, add to the `environment` array:

```json
{
  "name": "OTEL_EXPORTER_OTLP_ENDPOINT",
  "value": "http://YOUR_HOMELAB_PUBLIC_IP:4318"
},
{
  "name": "OTEL_EXPORTER_OTLP_PROTOCOL",
  "value": "http/protobuf"
}
```

And add to the `secrets` array:

```json
{
  "name": "OTEL_EXPORTER_OTLP_HEADERS",
  "valueFrom": "arn:aws:secretsmanager:us-east-1:985526967036:secret:resumeloop/prod/OTEL_BEARER_TOKEN-XXXXXX"
}
```

Replace `XXXXXX` with the actual suffix from Step 1. Replace `YOUR_HOMELAB_PUBLIC_IP` with your current public IP (check `infra/update-ip.sh` logic for how you update this).

Note: `OTEL_EXPORTER_OTLP_HEADERS` format must be `Authorization=Bearer <token>` — the Secrets Manager value should be the full header string, not just the token.

Update the secret value to the full header string:

```bash
aws secretsmanager put-secret-value \
  --secret-id resumeloop/prod/OTEL_BEARER_TOKEN \
  --secret-string "Authorization=Bearer $(cat .env.homelab | grep OTEL_BEARER_TOKEN | cut -d= -f2)" \
  --region us-east-1
```

- [ ] **Step 3: Grant ECS task role access to the new secret**

```bash
aws iam put-role-policy \
  --role-name ECSTaskResumeLoop \
  --policy-name OtelSecretAccess \
  --policy-document '{
    "Version": "2012-10-17",
    "Statement": [{
      "Effect": "Allow",
      "Action": "secretsmanager:GetSecretValue",
      "Resource": "arn:aws:secretsmanager:us-east-1:985526967036:secret:resumeloop/prod/OTEL_BEARER_TOKEN-*"
    }]
  }'
```

Use your actual account ID (985526967036 from the existing task def).

- [ ] **Step 4: Register the new task definition**

```bash
aws ecs register-task-definition \
  --cli-input-json file://infra/ecs-task-def.json \
  --region us-east-1
```

Expected: JSON output with `"status": "ACTIVE"` and an incremented `revision`.

- [ ] **Step 5: Commit the updated task def**

```bash
git add infra/ecs-task-def.json
git commit -m "feat(ecs): add OTEL exporter env vars — traces to homelab collector"
```

---

## Task 10: End-to-End Verification

Deploy to ECS and confirm traces flow all the way to Grafana Tempo.

- [ ] **Step 1: Deploy updated task definition**

```bash
aws ecs update-service \
  --cluster resumeloop \
  --service resumeloop \
  --task-definition resumeloop \
  --force-new-deployment \
  --region us-east-1
```

Wait for deployment to stabilize (~2 minutes):

```bash
aws ecs wait services-stable \
  --cluster resumeloop \
  --services resumeloop \
  --region us-east-1
```

- [ ] **Step 2: Generate a trace**

```bash
curl -s https://resumeloop.me/api/health
```

- [ ] **Step 3: Verify trace in Grafana**

In Grafana → Explore → select **Tempo** datasource.
Set **Query type: Search**, service name: `resumeloop`.
Click **Run query**.

Expected: at least one trace for the health endpoint within 30 seconds.
Click into a trace — you should see spans for the HTTP handler.

- [ ] **Step 4: Verify OTEL Collector received it**

```bash
docker compose -f infra/docker-compose.homelab.yml logs otel-collector --tail 20
```

Expected: lines like `"msg":"Traces"` with `"resource spans"` counts > 0.

- [ ] **Step 5: Test a Slack alert**

In Grafana → Alerting → Contact points → `slack-resumeloop` → **Send test**.
Expected: a test message appears in your Slack channel within 30 seconds.

- [ ] **Step 6: Final commit**

```bash
git commit --allow-empty -m "chore: end-to-end observability verified — traces in tempo, alerts to slack"
```

---

## Appendix: IP Update Workflow

Your homelab has a dynamic public IP. When it changes, update two places:

1. `OTEL_EXPORTER_OTLP_ENDPOINT` in `infra/ecs-task-def.json` → re-register task def → re-deploy ECS service
2. The Prometheus scrape target already uses the API Gateway URL (stable) — no change needed there

The existing `infra/update-ip.sh` handles DNS — extend it if you want to auto-update the ECS env var too.

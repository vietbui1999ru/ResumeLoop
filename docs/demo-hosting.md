---
title: "Public Demo Hosting"
description: "Operating the resumeloop.me public demo on a self-hosted homelab box with a local Ollama model."
tags: [deployment, demo, ollama, homelab]
updated: 2026-07-07
---

# Public Demo Hosting (resumeloop.me)

This is the authoritative operational doc for the maintainer's public demo. It fulfils
[ADR 0001 §4](adr/0001-pivot-to-local-first.md) ("Hosted demo — live, on a self-hosted
local model"). AWS infra was torn down 2026-07-06; the demo now runs on a Linux homelab
box, CPU-only, with `gemma4:e2b` via Ollama, behind a Cloudflare Tunnel.

For the *general* self-host story (any user's own machine), see the deprecated
[deploy.md](deploy.md) and the README — this doc is only about the public demo box.

## Architecture

```
Internet → Cloudflare edge → cloudflared (tunnel, no inbound port) → app:3000
                                                                       │ internal network
                                              ollama:11434 ←──────────┤ (never exposed)
                                              prometheus / grafana ←──┘ (Tailscale-only via host ports)
```

- **`DEMO_PUBLIC=1`** forces every session's AI provider to the local Ollama model
  (`lib/demo-mode.ts`, enforced in `lib/user-settings.ts`), disables credential signup,
  and blocks provider retargeting + profile ingest for demo sessions. "Try Demo" is the
  only entry point.
- **Load protection** (all env-tunable, defaults in parentheses):
  - `DEMO_MAX_CONCURRENT_INFERENCE` (1) — box-wide inference semaphore
    (`lib/inference-semaphore.ts`); keep `OLLAMA_NUM_PARALLEL` in agreement.
  - `DEMO_QUEUE_WAIT_MS` (5000) — slot wait before shedding load with 429.
  - `HOST_GUARD_LOAD_THRESHOLD` (1.5 load1/core) and `HOST_GUARD_MIN_FREE_MEM_PCT` (0.1) —
    circuit breaker (`lib/host-guard.ts`); refuses new inference with 503 when the box
    is under pressure (catches Ollama's CPU use, which app counters can't see).
  - `AI_REASON_TIMEOUT_MS` (60000) / `AI_REASON_RETRY_TIMEOUT_MS` (120000) — per-call
    generation ceilings; set from the on-box benchmark, CPU-only may need more.
  - `DEMO_CHAT_TIMEOUT_MS` (90000) — chat turn wall-clock ceiling; chat also drops to
    4 tool steps per turn in demo mode.
  - `DEMO_JD_MAX_CHARS` (20,000, `lib/config.ts`) — JD paste cap for demo sessions.
  - Existing gates stay: 10 lifetime generations + 3 concurrent per demo user,
    20/20 token buckets on chat/generate, 300 req/min/IP in middleware.
- **Demo cleanup** runs in-process: `lib/demo-cleanup-scheduler.ts`, started once
  from the root layout on the first request, purges expired demo users then
  every 6h (half the 12h TTL). It isn't wired through `instrumentation.ts`
  because that file is bundled by webpack for the Edge runtime too (this app
  has Edge middleware), and Edge can't resolve the Node builtins the demo-seed
  cleanup path needs. No external cron needed; `/api/cron/cleanup-demo` remains
  as a manual trigger (LOGS_API_KEY-gated).

## Bring-up

1. **Benchmark first (go/no-go).** On the target box: `ollama pull gemma4:e2b`, then run
   `reasonForJob()` against the seeded demo JDs (see `lib/demo-seed.ts`
   `DEMO_JOB_MARKDOWNS` × `DEMO_PROFILE_DATA`) and record which path each run takes
   (tool call / text fallback / JSON retry / failed), latency, and validation pass rate.
   No-go: all three tiers fail on a meaningful fraction, or usable timeouts push
   end-to-end past ~4-5 min. Use the results to set `AI_REASON_*_TIMEOUT_MS` and
   `OLLAMA_CONTEXT_LENGTH`.
2. **Configure.** `cp .env.prod.example .env.prod`, fill in values (uncomment the
   "Public demo mode" block, generate `METRICS_TOKEN`/`LOGS_API_KEY` with
   `openssl rand -hex 32`), and write the metrics token for Prometheus:
   `echo -n "$METRICS_TOKEN" > infra/prometheus/metrics-token`.
   Leave `GITHUB_CLIENT_ID`/`GOOGLE_CLIENT_ID` unset (hides OAuth). Keep
   `ENCRYPTION_KEY` set — `lib/crypto.ts` requires it even though demo users never
   store keys.
3. **Stage behind Tailscale** (no cloudflared yet):
   `docker compose -f docker-compose.prod.yml --env-file .env.prod up -d app ollama node-exporter prometheus grafana`.
   Verify: `/api/health` green; Try Demo → paste JD → generate round-trip completes;
   Prometheus target for `app:3000` is UP (proves the middleware whitelist);
   Grafana "Demo Guardrails" row renders; a demo user expires and is purged
   (trigger `cleanupExpiredDemoUsers()` manually rather than waiting 6h).
4. **Load-test.** Fire more simultaneous generations than
   `DEMO_MAX_CONCURRENT_INFERENCE`; expect clean 429s (`resumeloop_demo_429_total`
   increments), no runaway load, breaker trips visible as `resumeloop_host_pressure`.
5. **Go live.** Create the tunnel in Cloudflare Zero Trust, set `CF_TUNNEL_TOKEN`,
   add a public hostname rule `resumeloop.me → http://app:3000`, start `cloudflared`,
   flip DNS. Grafana/Prometheus stay Tailscale-only (host ports 3001/9090 — do not
   tunnel them).
6. **Burn-in.** Watch "AI Reason Path" (tool-calling reliability) and "429 / Shed Rate"
   panels for the first 48h; recalibrate timeouts/thresholds from real traffic.

## systemd unit

`/etc/systemd/system/resumeloop.service` on the host:

```ini
[Unit]
Description=ResumeLoop demo stack
Requires=docker.service
After=docker.service network-online.target

[Service]
WorkingDirectory=/home/<user>/resumeloop
ExecStartPre=/usr/bin/docker compose -f docker-compose.prod.yml --env-file .env.prod pull
ExecStart=/usr/bin/docker compose -f docker-compose.prod.yml --env-file .env.prod up
ExecStop=/usr/bin/docker compose -f docker-compose.prod.yml --env-file .env.prod down
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
```

`systemctl enable --now resumeloop` brings the stack back after a host reboot.

## Monitoring notes

- The in-stack Prometheus uses `infra/prometheus/prometheus.yml` (scrapes `app:3000`
  with the token file, plus `node-exporter:9100`).
  `infra/prometheus/resumeloop-scrape.yml` is a fragment for an *external* Prometheus
  scraping over Tailscale instead.
- The dashboard's "Local Inference" row (formerly "AI Spend") reads token throughput —
  there is no per-token cost on a self-hosted model, but throughput is still the
  utilization signal. Provider will always read `ollama`.
- Assumption to verify once on the target kernel: the app container's
  `os.loadavg()`/`os.freemem()` reflect *host* pressure (true on default Linux cgroup
  setups). Cross-check the `node` job's metrics; if they diverge, trust node-exporter
  and retune `HOST_GUARD_*`.

## Threat-model note

CONTEXT.md's "single-user, no auth, 127.0.0.1 is the boundary" invariant assumes the
owner's machine. The public demo deliberately breaks that premise, so the boundary
moves to the network edge (Cloudflare) plus `DEMO_PUBLIC` hardening: visitors get
ephemeral demo accounts (12h TTL), cannot create real accounts, cannot import
profiles, cannot repoint the model at other hosts, and every generation is bounded by
the semaphore + host breaker. Do not loosen these without revisiting the ADR.

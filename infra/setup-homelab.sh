#!/usr/bin/env bash
# One-time setup for the ResumeLoop homelab observability stack.
# Run from the REPO ROOT: bash infra/setup-homelab.sh
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

echo "=== ResumeLoop Homelab Setup ==="

# 1. Create .env.homelab if missing
if [ ! -f .env.homelab ]; then
  cp .env.homelab.example .env.homelab
  echo "✓ Created .env.homelab — fill in values before continuing"
  echo "  OTEL_BEARER_TOKEN: openssl rand -hex 32"
  echo "  METRICS_TOKEN: same value set on ECS task (METRICS_TOKEN secret)"
  echo "  GRAFANA_ADMIN_PASSWORD: choose a strong password"
  echo "  SLACK_WEBHOOK_URL: create an incoming webhook at api.slack.com/apps"
  echo ""
  echo "Edit .env.homelab then re-run this script."
  exit 0
fi

# 2. Validate required env vars are non-empty
source .env.homelab
MISSING=0
for var in OTEL_BEARER_TOKEN METRICS_TOKEN GRAFANA_ADMIN_PASSWORD SLACK_WEBHOOK_URL; do
  if [ -z "${!var:-}" ]; then
    echo "✗ $var is empty in .env.homelab"
    MISSING=1
  fi
done
[ "$MISSING" -eq 1 ] && echo "Fill in all variables in .env.homelab and re-run." && exit 1

# 3. Create secrets/metrics_token
mkdir -p secrets
echo -n "$METRICS_TOKEN" > secrets/metrics_token
chmod 600 secrets/metrics_token
echo "✓ secrets/metrics_token created (chmod 600)"

echo ""
echo "=== Setup complete. Start the stack ==="
echo "  docker compose -f infra/docker-compose.homelab.yml --env-file .env.homelab up -d"
echo ""
echo "Note: Forward port 4318 on your router to this host (OTEL Collector)."
echo "Access Grafana via Tailscale: http://<tailscale-ip>:3000"

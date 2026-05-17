#!/usr/bin/env bash
# One-time secret bootstrap for ResumeLoop production.
# Run locally with AWS credentials that have secretsmanager:CreateSecret perms.
# Usage:
#   export GOOGLE_CLIENT_ID=...
#   export GOOGLE_CLIENT_SECRET=...
#   export GITHUB_CLIENT_ID=...
#   export GITHUB_CLIENT_SECRET=...
#   export UPSTASH_REDIS_REST_URL=...
#   export UPSTASH_REDIS_REST_TOKEN=...
#   ./infra/bootstrap-secrets.sh
set -euo pipefail

REGION=us-east-1
PREFIX=resumeloop/prod

# Load from .env.local if present (values already exported take precedence)
ENV_FILE="$(dirname "$0")/../.env.local"
if [[ -f "$ENV_FILE" ]]; then
  while IFS='=' read -r key value; do
    [[ "$key" =~ ^#.*$ || -z "$key" ]] && continue
    key="${key// /}"          # strip spaces around key
    value="${value// /}"      # strip spaces around value
    [[ -z "${!key:-}" ]] && export "$key=$value"
  done < "$ENV_FILE"
fi

REQUIRED_VARS=(GOOGLE_CLIENT_ID GOOGLE_CLIENT_SECRET GITHUB_CLIENT_ID GITHUB_CLIENT_SECRET UPSTASH_REDIS_REST_URL UPSTASH_REDIS_REST_TOKEN)
for VAR in "${REQUIRED_VARS[@]}"; do
  if [[ -z "${!VAR:-}" ]]; then
    echo "Error: $VAR is not set. Export it before running this script." >&2
    exit 1
  fi
done

declare -A SECRETS=(
  [GOOGLE_CLIENT_ID]="$GOOGLE_CLIENT_ID"
  [GOOGLE_CLIENT_SECRET]="$GOOGLE_CLIENT_SECRET"
  [GITHUB_CLIENT_ID]="$GITHUB_CLIENT_ID"
  [GITHUB_CLIENT_SECRET]="$GITHUB_CLIENT_SECRET"
  [UPSTASH_REDIS_REST_URL]="$UPSTASH_REDIS_REST_URL"
  [UPSTASH_REDIS_REST_TOKEN]="$UPSTASH_REDIS_REST_TOKEN"
)

echo ""
echo "=== Creating / verifying secrets ==="
echo ""

for NAME in "${!SECRETS[@]}"; do
  FULL_NAME="$PREFIX/$NAME"
  VALUE="${SECRETS[$NAME]}"

  # Create if not exists; update value if it does
  if aws secretsmanager describe-secret --secret-id "$FULL_NAME" --region "$REGION" \
      --query 'Name' --output text &>/dev/null; then
    aws secretsmanager put-secret-value \
      --secret-id "$FULL_NAME" \
      --secret-string "$VALUE" \
      --region "$REGION" \
      --query 'ARN' --output text >/dev/null
    echo "  updated  $FULL_NAME"
  else
    aws secretsmanager create-secret \
      --name "$FULL_NAME" \
      --secret-string "$VALUE" \
      --region "$REGION" \
      --query 'ARN' --output text >/dev/null
    echo "  created  $FULL_NAME"
  fi
done

echo ""
echo "=== ARNs for infra/ecs-task-def.json ==="
echo "(paste these into the 'secrets' array)"
echo ""

for NAME in "${!SECRETS[@]}"; do
  FULL_NAME="$PREFIX/$NAME"
  ARN=$(aws secretsmanager describe-secret \
    --secret-id "$FULL_NAME" \
    --region "$REGION" \
    --query 'ARN' --output text)
  printf '    { "name": "%s", "valueFrom": "%s" },\n' "$NAME" "$ARN"
done

echo ""
echo "Done."

# CI/CD Pipelines Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire GitHub Actions CI (PR testing) + CD (main → ECR → homelab SSH via Tailscale), multi-stage Dockerfile, portable homelab compose, and AWS infra setup scripts.

**Architecture:** PRs run lint/typecheck/test/audit/build. Merges to main build a multi-stage Docker image, push to ECR, then SSH into homelab via Tailscale to pull and restart the container. AWS services used: ECR (registry), S3 (DOCX output, already implemented), Secrets Manager (runtime secrets for future AWS compute). Homelab uses `.env.prod` for secrets; Secrets Manager is wired for future App Runner/ECS.

**Tech Stack:** GitHub Actions, Docker multi-stage, AWS ECR + S3 + Secrets Manager + IAM OIDC, Tailscale SSH, Next.js standalone output, better-sqlite3 native addon

---

## Pre-flight: what already exists

Do NOT re-implement these — they are live on `main`:
- `lib/storage.ts` — S3/local switching via `APP_MODE=cloud`
- `lib/db-adapter.ts` — SQLite/Neon switching via `isCloud()`
- `lib/app-mode.ts` — `isCloud()` helper
- `app/api/health/route.ts` — basic `{ok, ts}` (Task 3 enhances it)
- `infra/apprunner.yaml` — App Runner config (keep, future reference)
- `infra/iam-policy.json` — IAM policy (Task 6 updates it)
- `docs/deploy.md` — existing deploy docs (Task 7 updates)
- `docs/aws-maintenance.md` — existing runbook (Task 7 updates)

---

## File Map

| Action | Path | Purpose |
|---|---|---|
| Modify | `Dockerfile` | Multi-stage: builder + runner; fix harness path |
| Create | `docker-compose.prod.yml` | Homelab portable compose (env vars, ECR image) |
| Create | `.env.prod.example` | Template for homelab `.env.prod` (committed) |
| Modify | `app/api/health/route.ts` | Add `version` from package.json |
| Create | `.github/workflows/ci.yml` | PR gate: lint → tsc → test → audit → build |
| Modify | `.github/workflows/deploy.yml` | Replace App Runner with homelab SSH via Tailscale |
| Modify | `infra/iam-policy.json` | Add Secrets Manager permissions |
| Create | `infra/setup-aws.sh` | One-time AWS resource creation (ECR + S3 + Secrets Manager) |
| Modify | `docs/deploy.md` | Add homelab section; update secrets to Secrets Manager |
| Modify | `docs/aws-maintenance.md` | Secrets Manager commands; homelab ops |

---

## Task 1: Multi-stage Dockerfile

**Context:** Current Dockerfile is single-stage — build tools (`python3 make g++`) stay in the final image, bloating it ~200MB. Also references `pipeline/batch-build/package.json` which doesn't exist; harness lives at `harness/`. Next.js `output: 'standalone'` is already set, enabling a minimal runtime image.

**Files:**
- Modify: `Dockerfile`

- [ ] **Step 1: Replace Dockerfile with multi-stage build**

```dockerfile
# ── Stage 1: build ────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

# build tools needed only for better-sqlite3 native addon compilation
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Install app dependencies first (layer cache)
COPY package.json package-lock.json* ./
RUN npm ci

# Install harness dependencies (docx, puppeteer, mammoth)
COPY harness/package.json harness/package-lock.json* ./harness/
RUN cd harness && npm ci

# Copy source and build Next.js (produces .next/standalone)
COPY . .
RUN npm run build

# ── Stage 2: runtime ──────────────────────────────────────────────────────────
FROM node:22-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production PORT=3000

# Next.js standalone includes pre-compiled node_modules (incl. better-sqlite3 .node)
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# Harness scripts needed at runtime for resume generation
COPY --from=builder /app/harness ./harness

# Pipeline bootstrap data files
COPY --from=builder /app/pipeline ./pipeline

# Resume/cover-letter DOCX templates
COPY --from=builder /app/templates ./templates

EXPOSE 3000
CMD ["node", "server.js"]
```

- [ ] **Step 2: Verify build locally**

```bash
docker build -t resumeloop:test .
```

Expected: build completes with two stages printed. Final image should be <400MB (vs ~700MB single-stage).

```bash
docker images resumeloop:test --format "{{.Size}}"
```

- [ ] **Step 3: Smoke-test the container**

```bash
docker run --rm -p 3010:3000 \
  -e AUTH_SECRET=test-secret-32-chars-minimum-here \
  -e NEXTAUTH_URL=http://localhost:3010 \
  resumeloop:test
```

Expected: server starts, `curl http://localhost:3010/api/health` returns `{"ok":true,...}`.

- [ ] **Step 4: Commit**

```bash
git add Dockerfile
git commit -m "build: multi-stage Dockerfile — builder + runner; fix harness path"
```

---

## Task 2: docker-compose.prod.yml + .env.prod.example

**Context:** Current `docker-compose.yml` has hardcoded Mac paths (`/Users/vietquocbui/...`) — unusable on homelab. Need a portable compose that reads paths from an `.env.prod` file on the homelab host and pulls the image from ECR.

**Files:**
- Create: `docker-compose.prod.yml`
- Create: `.env.prod.example`

- [ ] **Step 1: Create docker-compose.prod.yml**

```yaml
# docker-compose.prod.yml — homelab deployment
# Uses .env.prod on the host for secrets and paths. Never commit .env.prod.
# Start: docker compose -f docker-compose.prod.yml up -d
# Update: docker compose -f docker-compose.prod.yml pull && docker compose -f docker-compose.prod.yml up -d

services:
  app:
    image: ${ECR_REGISTRY}/resumeloop:${IMAGE_TAG:-latest}
    ports:
      - "3010:3000"
    env_file:
      - .env.prod
    volumes:
      # JD source files (read + write — scan tags JDs as resume-ed)
      - ${OBSIDIAN_JOBS_PATH}:/jobs
      # DOCX output
      - ${OUTPUT_PATH}:/output
      # SQLite DB — persists across image updates
      - ${DB_PATH:-./resume.db}:/app/resume.db
      # Pipeline data — edits via /config page persist to host
      - ${PIPELINE_DATA_PATH:-./pipeline/master_resume_data.json}:/app/pipeline/master_resume_data.json
    extra_hosts:
      # Reach Ollama on the homelab host
      - "host.docker.internal:host-gateway"
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:3000/api/health"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 15s
```

- [ ] **Step 2: Create .env.prod.example**

```bash
# .env.prod.example — copy to .env.prod on homelab host, fill in values.
# NEVER commit .env.prod.

# ── Paths (homelab-specific) ────────────────────────────────────────────────
ECR_REGISTRY=<account-id>.dkr.ecr.us-east-1.amazonaws.com
IMAGE_TAG=latest
OBSIDIAN_JOBS_PATH=/home/<user>/Obsidian/References/Jobs
OUTPUT_PATH=/home/<user>/resume-output
DB_PATH=/home/<user>/resumeloop/resume.db
PIPELINE_DATA_PATH=/home/<user>/resumeloop/pipeline/master_resume_data.json

# ── Auth ─────────────────────────────────────────────────────────────────────
AUTH_SECRET=<random-string-min-32-chars>
NEXTAUTH_URL=https://<tailscale-hostname>

# ── Mode (local = SQLite + filesystem) ───────────────────────────────────────
APP_MODE=local

# ── LLM (Ollama on host, or configure via Settings UI after first login) ─────
# LITELLM_URL=http://host.docker.internal:11434/v1
# LITELLM_MODEL=gemma4:e2b

# ── Encryption key for stored API keys ───────────────────────────────────────
ENCRYPTION_KEY=<32-byte-hex-string>

# ── Batch concurrency ────────────────────────────────────────────────────────
BATCH_CONCURRENCY=3
```

- [ ] **Step 3: Add .env.prod to .gitignore**

```bash
echo ".env.prod" >> .gitignore
```

Verify it's not already there:
```bash
grep ".env.prod" .gitignore
```

- [ ] **Step 4: Commit**

```bash
git add docker-compose.prod.yml .env.prod.example .gitignore
git commit -m "build: add portable homelab docker-compose.prod.yml + .env.prod.example"
```

---

## Task 3: Enhanced health route

**Context:** `app/api/health/route.ts` returns `{ok: true, ts: Date.now()}`. The deploy pipeline needs `version` to confirm the right image is running. Already marked public in `middleware.ts` — no auth needed.

**Files:**
- Modify: `app/api/health/route.ts`

- [ ] **Step 1: Update health route**

```typescript
import { NextResponse } from 'next/server'
import { version } from '@/package.json'

export async function GET() {
  return NextResponse.json({ ok: true, version, ts: Date.now() })
}
```

- [ ] **Step 2: Verify TypeScript accepts package.json import**

Check `tsconfig.json` has `"resolveJsonModule": true`. If not:

```bash
grep "resolveJsonModule" tsconfig.json
```

If missing, add to `compilerOptions` in `tsconfig.json`:
```json
"resolveJsonModule": true
```

- [ ] **Step 3: Run tests to confirm nothing broke**

```bash
npm test
```

Expected: 47 tests pass.

- [ ] **Step 4: Commit**

```bash
git add app/api/health/route.ts tsconfig.json
git commit -m "feat: health route returns version from package.json"
```

---

## Task 4: CI GitHub Actions workflow

**Context:** No CI workflow exists. Every PR should run lint → typecheck → test → security audit → build before merge. Uses Node.js cache for speed. Does NOT push to ECR or deploy — that only happens on merge to main.

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Create .github/workflows/ directory and ci.yml**

```bash
mkdir -p .github/workflows
```

```yaml
# .github/workflows/ci.yml
name: CI

on:
  pull_request:
    branches: [main]

jobs:
  ci:
    name: Lint · Typecheck · Test · Audit · Build
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Lint
        run: npm run lint

      - name: Typecheck
        run: npx tsc --noEmit

      - name: Unit tests
        run: npm test

      - name: Security audit
        run: npm audit --audit-level=high

      - name: Build
        run: npm run build
```

- [ ] **Step 2: Verify the workflow file is valid YAML**

```bash
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/ci.yml'))" && echo "valid"
```

Expected: `valid`

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add PR test pipeline — lint, typecheck, test, audit, build"
```

---

## Task 5: Deploy workflow — homelab SSH via Tailscale

**Context:** Replace the existing App Runner deploy workflow. On merge to main: (1) OIDC auth to AWS, (2) build + push Docker image to ECR with sha tag + `latest`, (3) join homelab's Tailscale network, (4) SSH into homelab, pull new image, restart compose, verify health.

Homelab prerequisites (manual one-time setup, documented in Task 7):
- AWS IAM user `resumeloop-homelab` with `AmazonEC2ContainerRegistryReadOnly` policy, credentials in `~/.aws/credentials` on homelab
- `docker-compose.prod.yml` and `.env.prod` at `~/resumeloop/` on homelab
- SSH public key of the GitHub Actions deploy key added to `~/.ssh/authorized_keys`

**Files:**
- Modify: `.github/workflows/deploy.yml`

**GitHub Secrets required:**
- `AWS_DEPLOY_ROLE_ARN` — OIDC role for ECR push (existing)
- `TAILSCALE_AUTHKEY` — ephemeral Tailscale auth key for GitHub runner
- `HOMELAB_HOST` — Tailscale hostname (e.g. `homelab-lxc.tailXXXX.ts.net`)
- `HOMELAB_USER` — SSH user on homelab
- `HOMELAB_SSH_KEY` — SSH private key (runner uses this to SSH into homelab)

- [ ] **Step 1: Replace .github/workflows/deploy.yml**

```yaml
# .github/workflows/deploy.yml
name: Deploy

on:
  push:
    branches: [main]

env:
  AWS_REGION: us-east-1
  ECR_REPOSITORY: resumeloop

jobs:
  build-push:
    name: Build and push to ECR
    runs-on: ubuntu-latest
    permissions:
      id-token: write   # required for OIDC
      contents: read

    outputs:
      ecr_registry: ${{ steps.login-ecr.outputs.registry }}
      image_tag: ${{ github.sha }}

    steps:
      - uses: actions/checkout@v4

      - name: Configure AWS credentials (OIDC)
        uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: ${{ secrets.AWS_DEPLOY_ROLE_ARN }}
          aws-region: ${{ env.AWS_REGION }}

      - name: Login to ECR
        id: login-ecr
        uses: aws-actions/amazon-ecr-login@v2

      - name: Build and push
        env:
          ECR_REGISTRY: ${{ steps.login-ecr.outputs.registry }}
          IMAGE_TAG: ${{ github.sha }}
        run: |
          docker build -t "$ECR_REGISTRY/$ECR_REPOSITORY:$IMAGE_TAG" .
          docker push "$ECR_REGISTRY/$ECR_REPOSITORY:$IMAGE_TAG"
          docker tag "$ECR_REGISTRY/$ECR_REPOSITORY:$IMAGE_TAG" \
                     "$ECR_REGISTRY/$ECR_REPOSITORY:latest"
          docker push "$ECR_REGISTRY/$ECR_REPOSITORY:latest"

  deploy-homelab:
    name: Deploy to homelab
    runs-on: ubuntu-latest
    needs: build-push

    steps:
      - name: Join Tailscale network
        uses: tailscale/github-action@v2
        with:
          authkey: ${{ secrets.TAILSCALE_AUTHKEY }}
          # Ephemeral key — runner leaves the tailnet when the job ends

      - name: Add homelab SSH key
        run: |
          mkdir -p ~/.ssh
          echo "${{ secrets.HOMELAB_SSH_KEY }}" > ~/.ssh/deploy_key
          chmod 600 ~/.ssh/deploy_key

      - name: Deploy
        env:
          ECR_REGISTRY: ${{ needs.build-push.outputs.ecr_registry }}
          IMAGE_TAG: ${{ needs.build-push.outputs.image_tag }}
          HOMELAB_USER: ${{ secrets.HOMELAB_USER }}
          HOMELAB_HOST: ${{ secrets.HOMELAB_HOST }}
        run: |
          ssh -i ~/.ssh/deploy_key \
              -o StrictHostKeyChecking=no \
              "$HOMELAB_USER@$HOMELAB_HOST" \
              "cd ~/resumeloop && \
               aws ecr get-login-password --region us-east-1 \
                 | docker login --username AWS --password-stdin $ECR_REGISTRY && \
               IMAGE_TAG=$IMAGE_TAG ECR_REGISTRY=$ECR_REGISTRY \
               docker compose -f docker-compose.prod.yml pull app && \
               docker compose -f docker-compose.prod.yml up -d && \
               sleep 10 && \
               curl -sf http://localhost:3010/api/health | grep '\"ok\":true'"
```

- [ ] **Step 2: Verify YAML is valid**

```bash
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/deploy.yml'))" && echo "valid"
```

Expected: `valid`

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/deploy.yml
git commit -m "ci: replace App Runner deploy with homelab SSH via Tailscale + ECR"
```

---

## Task 6: AWS infra setup

**Context:** Update IAM policy from SSM-only to Secrets Manager + S3 + ECR. Create a setup script that provisions all required AWS resources in one run. The existing `infra/apprunner.yaml` is kept as-is for future AWS compute reference.

**Files:**
- Modify: `infra/iam-policy.json`
- Create: `infra/setup-aws.sh`

- [ ] **Step 1: Update infra/iam-policy.json**

Replaces SSM-only policy with Secrets Manager + S3 + ECR pull (for future AWS compute):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "SecretsManagerRead",
      "Effect": "Allow",
      "Action": [
        "secretsmanager:GetSecretValue",
        "secretsmanager:DescribeSecret"
      ],
      "Resource": "arn:aws:secretsmanager:us-east-1:<ACCOUNT_ID>:secret:resumeloop/prod/*"
    },
    {
      "Sid": "S3Outputs",
      "Effect": "Allow",
      "Action": ["s3:PutObject", "s3:GetObject"],
      "Resource": "arn:aws:s3:::resumeloop-outputs/*"
    },
    {
      "Sid": "ECRPull",
      "Effect": "Allow",
      "Action": [
        "ecr:GetDownloadUrlForLayer",
        "ecr:BatchGetImage",
        "ecr:GetAuthorizationToken"
      ],
      "Resource": "*"
    }
  ]
}
```

- [ ] **Step 2: Create infra/setup-aws.sh**

One-time script to provision all required AWS resources. Run once per environment with `AWS_PROFILE` set.

```bash
#!/usr/bin/env bash
# infra/setup-aws.sh — provision AWS resources for ResumeLoop
# Run once: bash infra/setup-aws.sh
# Requires: aws cli v2, jq, AWS credentials with admin permissions

set -euo pipefail

REGION="us-east-1"
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
ECR_REPO="resumeloop"
S3_BUCKET="resumeloop-outputs-${ACCOUNT_ID}"
SECRET_PREFIX="resumeloop/prod"

echo "Account: $ACCOUNT_ID  Region: $REGION"

# ── ECR repository ────────────────────────────────────────────────────────────
echo "Creating ECR repository..."
aws ecr create-repository \
  --repository-name "$ECR_REPO" \
  --region "$REGION" \
  --image-scanning-configuration scanOnPush=true \
  --encryption-configuration encryptionType=AES256 2>/dev/null \
  || echo "ECR repo already exists"

# Enable lifecycle policy: keep last 10 images
aws ecr put-lifecycle-policy \
  --repository-name "$ECR_REPO" \
  --lifecycle-policy-text '{
    "rules": [{
      "rulePriority": 1,
      "description": "Keep last 10 images",
      "selection": {"tagStatus": "any", "countType": "imageCountMoreThan", "countNumber": 10},
      "action": {"type": "expire"}
    }]
  }'

# ── S3 bucket ─────────────────────────────────────────────────────────────────
echo "Creating S3 bucket: $S3_BUCKET..."
aws s3api create-bucket \
  --bucket "$S3_BUCKET" \
  --region "$REGION" 2>/dev/null \
  || echo "S3 bucket already exists"

aws s3api put-public-access-block \
  --bucket "$S3_BUCKET" \
  --public-access-block-configuration \
    "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true"

# ── Secrets Manager secrets ───────────────────────────────────────────────────
echo "Creating Secrets Manager placeholders..."
# Create placeholder secrets — fill actual values via AWS console or CLI
for SECRET_NAME in APP_MODE DATABASE_URL ENCRYPTION_KEY AUTH_SECRET NEXTAUTH_URL S3_BUCKET AWS_REGION; do
  aws secretsmanager create-secret \
    --name "${SECRET_PREFIX}/${SECRET_NAME}" \
    --description "ResumeLoop ${SECRET_NAME}" \
    --secret-string "REPLACE_ME" \
    --region "$REGION" 2>/dev/null \
    || echo "Secret ${SECRET_NAME} already exists"
done

# ── GitHub Actions OIDC role ──────────────────────────────────────────────────
echo "Creating GitHub Actions OIDC role..."
GITHUB_REPO="${GITHUB_REPO:-YOUR_GITHUB_USERNAME/ResumeLoop}"

TRUST_POLICY=$(cat <<EOF
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": {
      "Federated": "arn:aws:iam::${ACCOUNT_ID}:oidc-provider/token.actions.githubusercontent.com"
    },
    "Action": "sts:AssumeRoleWithWebIdentity",
    "Condition": {
      "StringEquals": {
        "token.actions.githubusercontent.com:aud": "sts.amazonaws.com"
      },
      "StringLike": {
        "token.actions.githubusercontent.com:sub": "repo:${GITHUB_REPO}:ref:refs/heads/main"
      }
    }
  }]
}
EOF
)

aws iam create-role \
  --role-name "GitHubActionsResumeLoop" \
  --assume-role-policy-document "$TRUST_POLICY" 2>/dev/null \
  || echo "IAM role already exists"

# Attach ECR push permissions
aws iam put-role-policy \
  --role-name "GitHubActionsResumeLoop" \
  --policy-name "ECRPush" \
  --policy-document '{
    "Version": "2012-10-17",
    "Statement": [{
      "Effect": "Allow",
      "Action": [
        "ecr:GetAuthorizationToken",
        "ecr:BatchCheckLayerAvailability",
        "ecr:GetDownloadUrlForLayer",
        "ecr:BatchGetImage",
        "ecr:InitiateLayerUpload",
        "ecr:UploadLayerPart",
        "ecr:CompleteLayerUpload",
        "ecr:PutImage"
      ],
      "Resource": "*"
    }]
  }'

ROLE_ARN=$(aws iam get-role --role-name "GitHubActionsResumeLoop" --query "Role.Arn" --output text)
ECR_REGISTRY="${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com"

echo ""
echo "✓ Setup complete. Add these to GitHub Secrets:"
echo "  AWS_DEPLOY_ROLE_ARN = ${ROLE_ARN}"
echo ""
echo "ECR registry: ${ECR_REGISTRY}"
echo "S3 bucket:    ${S3_BUCKET}"
echo ""
echo "Fill Secrets Manager values:"
echo "  aws secretsmanager update-secret --secret-id resumeloop/prod/AUTH_SECRET --secret-string '<value>'"
```

- [ ] **Step 3: Make script executable**

```bash
chmod +x infra/setup-aws.sh
```

- [ ] **Step 4: Commit**

```bash
git add infra/iam-policy.json infra/setup-aws.sh
git commit -m "infra: update IAM policy for Secrets Manager; add AWS setup script"
```

---

## Task 7: Documentation updates

**Context:** `docs/deploy.md` is App Runner-focused and references SSM Parameter Store. Needs a homelab section and Secrets Manager commands. `docs/aws-maintenance.md` needs Secrets Manager operations. These are existing files — update them, don't rewrite.

**Files:**
- Modify: `docs/deploy.md`
- Modify: `docs/aws-maintenance.md`

- [ ] **Step 1: Add homelab section to docs/deploy.md**

Read the existing file first, then insert a **Homelab deployment** section after the "Docker local" section and before the "AWS deployment" section. The new section:

```markdown
## Homelab deployment (primary)

The app runs on homelab (Proxmox LXC) and is accessed via Tailscale. The image is pulled from ECR; secrets are in `.env.prod` on the host.

### Prerequisites

- Docker + Docker Compose plugin installed on the LXC
- AWS CLI v2 installed: `apk add aws-cli` or equivalent
- IAM user `resumeloop-homelab` with `AmazonEC2ContainerRegistryReadOnly` policy
  - Run `aws configure` on the LXC with those credentials
- Tailscale installed and joined to your tailnet
- SSH key pair: add deploy key public key to `~/.ssh/authorized_keys`

### One-time setup

```bash
mkdir -p ~/resumeloop/pipeline
cd ~/resumeloop

# Copy docker-compose.prod.yml from the repo
# Copy .env.prod.example → .env.prod, fill in values
cp /path/to/repo/.env.prod.example .env.prod
# Edit .env.prod with actual paths and secrets

# Create empty DB file so Docker volume mount works
touch resume.db
```

### Manual deploy

```bash
cd ~/resumeloop
ECR_REGISTRY=<account-id>.dkr.ecr.us-east-1.amazonaws.com
aws ecr get-login-password --region us-east-1 \
  | docker login --username AWS --password-stdin $ECR_REGISTRY
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d
curl http://localhost:3010/api/health
```

### GitHub Actions deploy (automatic on merge to main)

Add these secrets to the GitHub repository (Settings → Secrets → Actions):

| Secret | Value |
|---|---|
| `TAILSCALE_AUTHKEY` | Ephemeral Tailscale auth key (generate in Tailscale admin) |
| `HOMELAB_HOST` | Tailscale hostname of the LXC |
| `HOMELAB_USER` | SSH user (e.g. `root` or your user) |
| `HOMELAB_SSH_KEY` | SSH private key (paste the full PEM) |
| `AWS_DEPLOY_ROLE_ARN` | Output of `infra/setup-aws.sh` |
```

- [ ] **Step 2: Update AWS secrets section in docs/deploy.md**

Find the "SSM parameters" section and replace references to `aws ssm put-parameter` with Secrets Manager equivalents:

```bash
# Fill in placeholder secrets created by infra/setup-aws.sh
aws secretsmanager update-secret \
  --secret-id resumeloop/prod/APP_MODE \
  --secret-string "cloud"

aws secretsmanager update-secret \
  --secret-id resumeloop/prod/AUTH_SECRET \
  --secret-string "$(openssl rand -hex 32)"

aws secretsmanager update-secret \
  --secret-id resumeloop/prod/ENCRYPTION_KEY \
  --secret-string "$(openssl rand -hex 32)"

# Neon connection string from Neon dashboard
aws secretsmanager update-secret \
  --secret-id resumeloop/prod/DATABASE_URL \
  --secret-string "postgresql://..."

# S3 bucket (output of setup-aws.sh)
aws secretsmanager update-secret \
  --secret-id resumeloop/prod/S3_BUCKET \
  --secret-string "resumeloop-outputs-<account-id>"
```

- [ ] **Step 3: Add Secrets Manager operations to docs/aws-maintenance.md**

Add a **Secrets** section:

```markdown
## Secrets (AWS Secrets Manager)

### List all secrets

```bash
aws secretsmanager list-secrets \
  --filter Key=name,Values=resumeloop/prod \
  --query 'SecretList[].Name'
```

### Rotate a secret

```bash
aws secretsmanager update-secret \
  --secret-id resumeloop/prod/AUTH_SECRET \
  --secret-string "$(openssl rand -hex 32)"
```

After rotating `AUTH_SECRET` or `ENCRYPTION_KEY`, restart the container — all active sessions are invalidated.

### Read a secret (for debugging)

```bash
aws secretsmanager get-secret-value \
  --secret-id resumeloop/prod/AUTH_SECRET \
  --query SecretString --output text
```
```

- [ ] **Step 4: Commit**

```bash
git add docs/deploy.md docs/aws-maintenance.md
git commit -m "docs: add homelab deploy section; update secrets to Secrets Manager"
```

---

## GitHub Secrets Setup Checklist

After all tasks are committed, configure these in GitHub (Settings → Secrets and variables → Actions):

| Secret | How to get |
|---|---|
| `AWS_DEPLOY_ROLE_ARN` | Output of `bash infra/setup-aws.sh` |
| `TAILSCALE_AUTHKEY` | Tailscale admin → Settings → Keys → Generate auth key (check "Ephemeral") |
| `HOMELAB_HOST` | Tailscale admin → Machines → copy the machine's Tailscale hostname |
| `HOMELAB_USER` | Your SSH user on the homelab LXC |
| `HOMELAB_SSH_KEY` | `cat ~/.ssh/id_ed25519` (the private key, full PEM block) |

---

## Self-Review

### Spec coverage

| Decision from grill | Task |
|---|---|
| Multi-stage Dockerfile | Task 1 |
| docker-compose.prod.yml (homelab portable) | Task 2 |
| Health route with version | Task 3 |
| CI: lint + tsc + test + audit + build on PR | Task 4 |
| Deploy: main → ECR + homelab SSH via Tailscale | Task 5 |
| ECR + S3 + Secrets Manager + IAM OIDC | Task 6 |
| us-east-1 region | Tasks 5, 6 |
| Credentials split: GitHub Secrets (pipeline) vs Secrets Manager (runtime) | Tasks 5, 6, 7 |
| Homelab uses Tailscale hostname for NEXTAUTH_URL | Task 2 (.env.prod.example) |
| OAuth credentials-only on homelab, OAuth on AWS | .env.prod.example (no OAuth vars) |
| CI gates: lint → tsc → test → audit → build | Task 4 |
| /api/health public endpoint | Task 3 (middleware already correct) |

### Gaps

- `infra/apprunner.yaml` references SSM ARNs — left as-is (future reference). Add a note at top of file pointing to Secrets Manager for active deployments. (Optional cleanup, not blocking.)
- Homelab ECR pull requires `aws configure` on the LXC with a dedicated IAM user — documented in Task 7 but IAM user creation is manual (not scripted). Acceptable for a personal tool.

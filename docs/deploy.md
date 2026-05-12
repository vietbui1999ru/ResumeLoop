---
title: "Deployment Guide"
description: "How to run ResumeAnalyze locally and deploy it to AWS App Runner."
tags: [deployment, aws, docker, local-dev]
updated: 2026-05-11
---

# Deployment Guide

ResumeAnalyze runs as a Next.js 14 application in two modes:

- **Local** — SQLite database, filesystem storage, Ollama for LLM calls. No AWS account needed.
- **Cloud** — AWS App Runner (compute) + Neon serverless Postgres (database) + S3 (file storage). Secrets injected at runtime from SSM Parameter Store.

The mode is controlled by the `APP_MODE` environment variable. When `APP_MODE=cloud`, the app switches to Neon and S3. Any other value (or unset) means local mode.

---

## Prerequisites

### Local development
- Node.js 20+
- npm

### Docker local
- Docker Desktop (or Docker Engine + Compose plugin)

### AWS deployment
- AWS CLI v2 — [install guide](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html)
- AWS account configured: `aws configure`
- Docker installed locally (for building the image)
- GitHub repository with Actions enabled

---

## Local development

### 1. Install and run

```bash
npm install
npm run dev
```

The app starts on `http://localhost:3000`.

### 2. Environment variables

Create `.env.local` in the project root. Only the variables you actually need are required; the rest have safe defaults.

```bash
# .env.local template

# --- File paths ---
# Default: reads/writes from project root
OBSIDIAN_JOBS_PATH=/path/to/your/JobData/Jobs
OUTPUT_PATH=/path/to/your/output/dir

# --- Auth ---
NEXTAUTH_SECRET=any-random-string-min-32-chars
NEXTAUTH_URL=http://localhost:3000
ENCRYPTION_KEY=any-32-byte-hex-string  # openssl rand -hex 32

# --- NOT needed locally ---
# APP_MODE        (leave unset — defaults to local/SQLite)
# DATABASE_URL    (leave unset — SQLite is used)
# S3_BUCKET       (leave unset — filesystem is used)
# AWS_REGION      (leave unset)
```

Note: LLM integration (Ollama/LiteLLM) is now configured per-user in Settings. AI provider configuration is no longer set via environment variables.

### 3. SQLite database

The local database lives at `resume.db` in the project root. It is created automatically on first startup. No manual migration steps needed — `initSchema` in `lib/db.ts` runs on every startup and applies any missing column additions via `ALTER TABLE` guards.

To override the path:

```bash
DB_PATH=./data/resume.db npm run dev
```

---

## Docker local

### Run with docker-compose

```bash
docker-compose up
```

The app is available at `http://localhost:3010`.

### Volume mounts

`docker-compose.yml` mounts three host paths into the container:

| Mount | Purpose |
|---|---|
| `./resume.db:/app/resume.db` | SQLite persistence across container rebuilds |
| `./pipeline/master_resume_data.json:/app/pipeline/master_resume_data.json` | Resume bullet data — edits via /config persist to host |
| `./pipeline/buildv2.js:/app/pipeline/buildv2.js` | DOCX generation engine |

Adjust the `OBSIDIAN_JOBS_PATH` and `OUTPUT_PATH` values in `docker-compose.yml` to point at your actual JD source directory and DOCX output directory.

**Note on path settings:** The default value is read from the environment variable on first setup. After that, the database value (set via the Settings UI) takes precedence. To change paths, use the Settings UI in the app rather than editing environment variables.

The container reaches Ollama on the host machine via `host.docker.internal:11434`. This is already configured in `docker-compose.yml`.

### Build the image manually

```bash
docker build -t resumeanalyze .
docker run -p 3010:3000 resumeanalyze
```

The Dockerfile uses a three-stage build (deps → builder → runner) on `node:20-alpine`. The final image runs as a non-root `nextjs` user and exposes port 3000. Next.js standalone output is used (`output: 'standalone'` in `next.config.mjs`).

---

## Homelab deployment (primary)

The app runs on a Proxmox LXC node accessed via Tailscale. Docker images are pulled from ECR; secrets live in `.env.prod` on the host.

### Prerequisites

- Docker + Docker Compose plugin on the LXC
- AWS CLI v2: `apk add aws-cli` or `apt install awscli`
- IAM user `resumeanalyze-homelab` with `AmazonEC2ContainerRegistryReadOnly` policy — run `aws configure` with those credentials
- Tailscale installed and joined to your tailnet
- SSH key pair: add deploy key public key to `~/.ssh/authorized_keys`

### One-time setup

```bash
mkdir -p ~/resumeanalyze/pipeline
cd ~/resumeanalyze

# Copy docker-compose.prod.yml from the repo
# Copy .env.prod.example → .env.prod and fill in values
cp /path/to/repo/.env.prod.example .env.prod
# Edit .env.prod with actual paths, AUTH_SECRET, NEXTAUTH_URL, etc.

touch resume.db  # Docker volume mount requires file to exist
```

### Manual deploy

```bash
cd ~/resumeanalyze
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
| `TAILSCALE_AUTHKEY` | Ephemeral Tailscale auth key (Tailscale admin → Settings → Keys → Generate auth key, check "Ephemeral") |
| `HOMELAB_HOST` | Tailscale hostname of the LXC |
| `HOMELAB_USER` | SSH user (e.g. `root`) |
| `HOMELAB_SSH_KEY` | SSH private key — paste full PEM block |
| `AWS_DEPLOY_ROLE_ARN` | Output of `bash infra/setup-aws.sh` |

---

## AWS deployment

### Architecture

```
GitHub (push to main)
  → GitHub Actions (OIDC auth → ECR push → App Runner trigger)

AWS App Runner
  ← ECR image (latest)
  ← SSM Parameter Store (all secrets at runtime)
  ← IAM instance role (SSM read + S3 write)

App Runner
  → Neon (Postgres, DATABASE_URL connection string)
  → S3 (resumeanalyze-outputs bucket, DOCX/PDF storage)
```

Health check: `GET /api/health` — App Runner polls this every 10 seconds.

---

### Step 1: ECR repository

```bash
aws ecr create-repository \
  --repository-name resumeanalyze \
  --region us-east-1
```

Note the `repositoryUri` in the output — this is your `<ECR_REGISTRY>`.

---

### Step 2: S3 bucket

```bash
aws s3api create-bucket \
  --bucket resumeanalyze-outputs \
  --region us-east-1

# Enable versioning
aws s3api put-bucket-versioning \
  --bucket resumeanalyze-outputs \
  --versioning-configuration Status=Enabled

# Abort incomplete multipart uploads after 7 days
aws s3api put-bucket-lifecycle-configuration \
  --bucket resumeanalyze-outputs \
  --lifecycle-configuration '{
    "Rules": [{
      "ID": "abort-incomplete-multipart",
      "Status": "Enabled",
      "AbortIncompleteMultipartUpload": { "DaysAfterInitiation": 7 },
      "Filter": { "Prefix": "" }
    }]
  }'
```

---

### Step 3: Secrets Manager values

All secrets are created as placeholders by `bash infra/setup-aws.sh`. Fill in real values:

```bash
aws secretsmanager update-secret \
  --secret-id resumeanalyze/prod/APP_MODE \
  --secret-string "cloud"

aws secretsmanager update-secret \
  --secret-id resumeanalyze/prod/AUTH_SECRET \
  --secret-string "$(openssl rand -hex 32)"

aws secretsmanager update-secret \
  --secret-id resumeanalyze/prod/ENCRYPTION_KEY \
  --secret-string "$(openssl rand -hex 32)"

# Neon connection string from Neon dashboard → Connection Details
aws secretsmanager update-secret \
  --secret-id resumeanalyze/prod/DATABASE_URL \
  --secret-string "postgresql://..."

# S3 bucket name (output of setup-aws.sh)
aws secretsmanager update-secret \
  --secret-id resumeanalyze/prod/S3_BUCKET \
  --secret-string "resumeanalyze-outputs-<account-id>"

aws secretsmanager update-secret \
  --secret-id resumeanalyze/prod/NEXTAUTH_URL \
  --secret-string "https://<your-app-runner-url>"
```

---

### Step 4: IAM role for App Runner

The App Runner instance role grants permission to read SSM parameters and write objects to S3.

```bash
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)

aws iam create-role \
  --role-name AppRunnerResumeAnalyzeRole \
  --assume-role-policy-document '{
    "Version": "2012-10-17",
    "Statement": [{
      "Effect": "Allow",
      "Principal": { "Service": "tasks.apprunner.amazonaws.com" },
      "Action": "sts:AssumeRole"
    }]
  }'

sed "s/<ACCOUNT_ID>/$ACCOUNT_ID/g" infra/iam-policy.json > /tmp/iam-policy-resolved.json

aws iam put-role-policy \
  --role-name AppRunnerResumeAnalyzeRole \
  --policy-name ResumeAnalyzePolicy \
  --policy-document file:///tmp/iam-policy-resolved.json
```

The policy in `infra/iam-policy.json` grants:
- `ssm:GetParameter` + `ssm:GetParameters` on `arn:aws:ssm:us-east-1:<ACCOUNT_ID>:parameter/resumeanalyze/prod/*`
- `s3:PutObject` + `s3:GetObject` on `arn:aws:s3:::resumeanalyze-outputs/*`

---

### Step 5: GitHub OIDC trust

This lets GitHub Actions assume an AWS role without storing long-lived AWS access keys in GitHub secrets.

```bash
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
GITHUB_ORG=<YOUR_GITHUB_USERNAME_OR_ORG>
GITHUB_REPO=ResumeAnalyze

# One-time per AWS account — skip if OIDC provider already exists
aws iam create-open-id-connect-provider \
  --url https://token.actions.githubusercontent.com \
  --client-id-list sts.amazonaws.com \
  --thumbprint-list 6938fd4d98bab03faadb97b34396831e3780aea1

aws iam create-role \
  --role-name GitHubActionsResumeAnalyzeDeploy \
  --assume-role-policy-document "{
    \"Version\": \"2012-10-17\",
    \"Statement\": [{
      \"Effect\": \"Allow\",
      \"Principal\": {
        \"Federated\": \"arn:aws:iam::$ACCOUNT_ID:oidc-provider/token.actions.githubusercontent.com\"
      },
      \"Action\": \"sts:AssumeRoleWithWebIdentity\",
      \"Condition\": {
        \"StringEquals\": {
          \"token.actions.githubusercontent.com:aud\": \"sts.amazonaws.com\"
        },
        \"StringLike\": {
          \"token.actions.githubusercontent.com:sub\": \"repo:$GITHUB_ORG/$GITHUB_REPO:ref:refs/heads/main\"
        }
      }
    }]
  }"

aws iam attach-role-policy \
  --role-name GitHubActionsResumeAnalyzeDeploy \
  --policy-arn arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryPowerUser

aws iam put-role-policy \
  --role-name GitHubActionsResumeAnalyzeDeploy \
  --policy-name AppRunnerDeploy \
  --policy-document '{
    "Version": "2012-10-17",
    "Statement": [{
      "Effect": "Allow",
      "Action": "apprunner:StartDeployment",
      "Resource": "*"
    }]
  }'
```

---

### Step 6: App Runner service

`infra/apprunner.yaml` defines the service: ECR image source, port 3000, SSM secret ARNs, instance role, `0.5 vCPU / 1 GB` compute, and the `/api/health` HTTP health check.

```bash
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
ECR_REGISTRY=$(aws ecr describe-repositories \
  --repository-names resumeanalyze \
  --query 'repositories[0].repositoryUri' \
  --output text | sed 's|/resumeanalyze||')

sed -e "s|<ECR_REGISTRY>|$ECR_REGISTRY|g" \
    -e "s|<ACCOUNT_ID>|$ACCOUNT_ID|g" \
    infra/apprunner.yaml > /tmp/apprunner-resolved.yaml

aws apprunner create-service --cli-input-yaml file:///tmp/apprunner-resolved.yaml
```

From the output, note:
- `ServiceArn` — needed for the GitHub secret and manual redeploys
- `ServiceUrl` — the public HTTPS URL

Update the `NEXTAUTH_URL` SSM parameter with the actual URL:

```bash
aws ssm put-parameter \
  --name /resumeanalyze/prod/NEXTAUTH_URL \
  --value "https://<ServiceUrl>" \
  --type SecureString \
  --overwrite
```

---

### Step 7: GitHub secrets

In your repository: **Settings → Secrets and variables → Actions → New repository secret**.

| Secret | Value |
|---|---|
| `AWS_DEPLOY_ROLE_ARN` | `arn:aws:iam::<ACCOUNT_ID>:role/GitHubActionsResumeAnalyzeDeploy` |
| `APP_RUNNER_SERVICE_ARN` | `ServiceArn` from the `create-service` output |

---

### Step 8: First deployment

Push to `main`. The workflow in `.github/workflows/deploy.yml` will:

1. Authenticate to AWS via OIDC (no stored access keys)
2. Build the Docker image and push to ECR with two tags: the git SHA and `latest`
3. Trigger App Runner to pull the new `latest` image

Note: `AutoDeploymentsEnabled: false` in `apprunner.yaml` — App Runner does not watch ECR. The GitHub Actions workflow calls `aws apprunner start-deployment` explicitly after each push.

Monitor the first deployment:

```bash
aws apprunner list-operations \
  --service-arn <APP_RUNNER_SERVICE_ARN> \
  --query 'OperationSummaryList[0]'
```

Verify the service is healthy:

```bash
curl https://<ServiceUrl>/api/health
```

---

## Environment variables reference

| Variable | Local | Cloud | Source | Description |
|---|---|---|---|---|
| `APP_MODE` | Not set | `cloud` | SSM | Switches DB and storage to Neon + S3 when set to `"cloud"` |
| `DATABASE_URL` | Not set | Required | SSM | Neon Postgres connection string (`postgresql://...?sslmode=require`) |
| `NEXTAUTH_SECRET` | Required | Required | SSM / `.env.local` | NextAuth session signing secret, min 32 chars |
| `NEXTAUTH_URL` | `http://localhost:3000` | App Runner URL | SSM / `.env.local` | Canonical URL of the app; must match the actual domain |
| `ENCRYPTION_KEY` | Required | Required | SSM / `.env.local` | 32-byte hex key for encrypting stored API keys; generate with `openssl rand -hex 32` |
| `S3_BUCKET` | Not set | Required | SSM | S3 bucket name for DOCX/PDF output storage |
| `AWS_REGION` | Not set | `us-east-1` | SSM | AWS region; used by S3 client |
| `LITELLM_URL` | `http://localhost:11434/v1` | Not used | `.env.local` / `docker-compose.yml` | Base URL for Ollama-compatible LLM API |
| `LITELLM_MODEL` | `gemma4:e2b` | Not used | `.env.local` / `docker-compose.yml` | Model name for local LLM calls |
| `OBSIDIAN_JOBS_PATH` | Project root | Not used | `.env.local` / `docker-compose.yml` | Directory containing JD markdown files |
| `OUTPUT_PATH` | Project root | Not used | `.env.local` / `docker-compose.yml` | Directory for DOCX/PDF output (local mode) |
| `DB_PATH` | `resume.db` (project root) | Not used | `.env.local` / `docker-compose.yml` | Override SQLite file path (local mode only) |
| `BATCH_CONCURRENCY` | `3` | Not used | `docker-compose.yml` | Max parallel jobs during batch generation |

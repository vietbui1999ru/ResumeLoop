# AWS Deployment & Setup — Design Spec

**Date:** 2026-05-13
**Branch:** worktree-feat+cicd-pipelines
**Status:** Approved

## Goal

Write a detailed, accurate AWS deployment guide for a beta/demo web app with user auth, persistent accounts, and encrypted API key storage. Target: 5–50 users, App Runner as compute, Neon as database, App Runner default URL (no custom domain for beta).

Replaces the stale AWS section in `docs/deploy.md` (which incorrectly described an App Runner setup that was never implemented) and the homelab-first framing. Homelab deployment is deferred to a separate doc.

## Target Architecture

```
GitHub (push to main)
  → GitHub Actions
      ├─ OIDC auth → AWS (no stored keys)
      ├─ docker build → ECR push (SHA tag + latest)
      └─ aws apprunner start-deployment

AWS App Runner
  ← ECR image
  ← Secrets Manager (7 secrets injected at container start)
  ← IAM instance role (Secrets Manager read + S3 write)

App Runner
  → Neon (Postgres, DATABASE_URL — serverless, external)
  → S3 (resumeanalyze-outputs-<account-id>, DOCX/PDF storage)
```

### Why App Runner

- Managed HTTPS (auto-provisioned cert on the default URL)
- Scale-to-zero — no cost when idle
- Scales horizontally to 25 instances with zero config changes
- No server to maintain
- Native Secrets Manager injection (secrets injected as env vars at container start)

### Why Neon

- Free tier: 0.5 GB storage, autosuspend (no idle cost)
- Same Postgres interface — migrate to RDS later with just a URL change
- App already supports `APP_MODE=cloud` which switches to Neon

## What Already Exists

| Resource | Status |
|---|---|
| `infra/setup-aws.sh` | Creates ECR + S3 + Secrets Manager placeholders + OIDC provider + GitHub Actions IAM role |
| `infra/iam-policy.json` | App Runner instance role policy (Secrets Manager read + S3 write + ECR pull) |
| `.github/workflows/deploy.yml` | Builds + pushes to ECR, then SSHes to homelab (homelab job to be replaced) |
| App auth (`NextAuth`) | Already in codebase |
| API key encryption (`ENCRYPTION_KEY`) | Already in codebase |
| `APP_MODE=cloud` Neon support | Already in codebase |

## Files Changed

| Action | File | Description |
|---|---|---|
| Rewrite | `docs/deploy.md` | AWS as primary path, homelab section removed |
| Create | `infra/apprunner.yaml` | App Runner service config template |
| Update | `docs/aws-maintenance.md` | Fix stale App Runner references + Secrets Manager commands |
| Update | `.github/workflows/deploy.yml` | Replace `deploy-homelab` job with `deploy-apprunner` job |

## `docs/deploy.md` Structure

### Architecture overview
Table: service → role → cost notes. Makes it clear what each AWS piece does before any commands are run.

### Prerequisites
- AWS account + AWS CLI v2 configured (`aws configure`)
- Docker installed locally
- GitHub repository with Actions enabled
- Neon account (free at neon.tech)

### Part 1 — One-time AWS infra
```bash
bash infra/setup-aws.sh
```
Script creates: ECR repo (scan-on-push, keep-last-10 lifecycle), S3 bucket (public access blocked), 7 Secrets Manager placeholders, GitHub OIDC provider, `GitHubActionsResumeAnalyze` IAM role with ECR push permissions.

Output: `AWS_DEPLOY_ROLE_ARN` value + ECR registry URL. Save both.

After the script completes, add `apprunner:StartDeployment` to the GitHub Actions role (required for Part 5):
```bash
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
aws iam put-role-policy \
  --role-name GitHubActionsResumeAnalyze \
  --policy-name AppRunnerDeploy \
  --policy-document '{
    "Version":"2012-10-17",
    "Statement":[{"Effect":"Allow","Action":"apprunner:StartDeployment","Resource":"*"}]
  }'
```

### Part 2 — Neon database
Steps:
1. Sign up at neon.tech → create project `resumeanalyze` → region `us-east-1`
2. Dashboard → Connection Details → copy **Pooled connection string** (required for serverless)
3. Format: `postgresql://user:pass@host/dbname?sslmode=require`

### Part 3 — Fill Secrets Manager values
Seven secrets created as `REPLACE_ME` by setup script. Fill each:

| Secret path | Value | How to get it |
|---|---|---|
| `resumeanalyze/prod/APP_MODE` | `cloud` | Literal string |
| `resumeanalyze/prod/DATABASE_URL` | Neon pooled connection string | Neon dashboard |
| `resumeanalyze/prod/AUTH_SECRET` | `openssl rand -hex 32` | Run locally |
| `resumeanalyze/prod/ENCRYPTION_KEY` | `openssl rand -hex 32` | Run locally |
| `resumeanalyze/prod/NEXTAUTH_URL` | App Runner service URL | Fill after Part 4 |
| `resumeanalyze/prod/S3_BUCKET` | `resumeanalyze-outputs-<account-id>` | Output of setup script |
| `resumeanalyze/prod/AWS_REGION` | `us-east-1` | Literal string |

CLI command pattern for each:
```bash
aws secretsmanager update-secret \
  --secret-id resumeanalyze/prod/<NAME> \
  --secret-string "<value>"
```

Note: `NEXTAUTH_URL` gets filled after Part 4 (need App Runner URL first).

### Part 4 — App Runner service

#### 4a: Instance role (CLI)
App Runner needs a role to read secrets and write to S3 at runtime.

```bash
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)

aws iam create-role \
  --role-name AppRunnerResumeAnalyze \
  --assume-role-policy-document '{
    "Version":"2012-10-17",
    "Statement":[{"Effect":"Allow","Principal":{"Service":"tasks.apprunner.amazonaws.com"},"Action":"sts:AssumeRole"}]
  }'

sed "s/<ACCOUNT_ID>/$ACCOUNT_ID/g" infra/iam-policy.json > /tmp/policy.json

aws iam put-role-policy \
  --role-name AppRunnerResumeAnalyze \
  --policy-name ResumeAnalyzePolicy \
  --policy-document file:///tmp/policy.json
```

#### 4b: Create App Runner service (Console — callout boxes)
Console path preferred here because the YAML-based CLI creation requires exact ARN substitutions that are error-prone.

**Console:** [App Runner → Services → Create service](https://console.aws.amazon.com/apprunner/home)

Step-by-step click path documented with exact field values:
- Source: ECR → `<account-id>.dkr.ecr.us-east-1.amazonaws.com/resumeanalyze:latest`
- Deployment trigger: Manual (GitHub Actions calls `start-deployment`)
- Port: `3000`
- Instance role: `AppRunnerResumeAnalyze`
- Environment variables: add all 7 from Secrets Manager (use "Add from Secrets Manager" option)
- Health check: `GET /api/health` — path, interval 10s, threshold 3

From the created service: copy `Default domain` (the `*.awsapprunner.com` URL).

#### 4c: Update NEXTAUTH_URL
```bash
aws secretsmanager update-secret \
  --secret-id resumeanalyze/prod/NEXTAUTH_URL \
  --secret-string "https://<your-service>.us-east-1.awsapprunner.com"
```

### Part 5 — Update deploy.yml
Replace the `deploy-homelab` job with a `deploy-apprunner` job:

```yaml
deploy-apprunner:
  name: Deploy to App Runner
  runs-on: ubuntu-latest
  needs: build-push
  permissions:
    id-token: write
    contents: read

  steps:
    - name: Configure AWS credentials (OIDC)
      uses: aws-actions/configure-aws-credentials@v4
      with:
        role-to-assume: ${{ secrets.AWS_DEPLOY_ROLE_ARN }}
        aws-region: us-east-1

    - name: Trigger App Runner deployment
      run: |
        aws apprunner start-deployment \
          --service-arn ${{ secrets.APP_RUNNER_SERVICE_ARN }}
```

### Part 6 — GitHub secrets
Two secrets to add (Settings → Secrets and variables → Actions):

| Secret | Value |
|---|---|
| `AWS_DEPLOY_ROLE_ARN` | Output of `setup-aws.sh` |
| `APP_RUNNER_SERVICE_ARN` | From App Runner console → Service ARN |

### Part 7 — First deployment
```bash
git push origin main
```

Monitor:
```bash
aws apprunner list-operations \
  --service-arn <APP_RUNNER_SERVICE_ARN> \
  --query 'OperationSummaryList[0].{Status:Status,Type:Type}'
```

Verify:
```bash
curl https://<your-service>.us-east-1.awsapprunner.com/api/health
```

Expected: `{"ok":true,"version":"..."}`

## `infra/apprunner.yaml` — Reference Config

Template file for reference/IaC use. Not used directly by the deploy workflow (Console creation is documented as primary), but useful for reproducing the service config or automating it later.

```yaml
Service:
  ServiceName: resumeanalyze
  SourceConfiguration:
    AuthenticationConfiguration:
      AccessRoleArn: arn:aws:iam::<ACCOUNT_ID>:role/AppRunnerResumeAnalyze
    AutoDeploymentsEnabled: false
    ImageRepository:
      ImageIdentifier: <ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com/resumeanalyze:latest
      ImageRepositoryType: ECR
      ImageConfiguration:
        Port: "3000"
        RuntimeEnvironmentSecrets:
          APP_MODE: arn:aws:secretsmanager:us-east-1:<ACCOUNT_ID>:secret:resumeanalyze/prod/APP_MODE
          DATABASE_URL: arn:aws:secretsmanager:us-east-1:<ACCOUNT_ID>:secret:resumeanalyze/prod/DATABASE_URL
          AUTH_SECRET: arn:aws:secretsmanager:us-east-1:<ACCOUNT_ID>:secret:resumeanalyze/prod/AUTH_SECRET
          ENCRYPTION_KEY: arn:aws:secretsmanager:us-east-1:<ACCOUNT_ID>:secret:resumeanalyze/prod/ENCRYPTION_KEY
          NEXTAUTH_URL: arn:aws:secretsmanager:us-east-1:<ACCOUNT_ID>:secret:resumeanalyze/prod/NEXTAUTH_URL
          S3_BUCKET: arn:aws:secretsmanager:us-east-1:<ACCOUNT_ID>:secret:resumeanalyze/prod/S3_BUCKET
          AWS_REGION: arn:aws:secretsmanager:us-east-1:<ACCOUNT_ID>:secret:resumeanalyze/prod/AWS_REGION
  InstanceConfiguration:
    Cpu: "0.5 vCPU"
    Memory: "1 GB"
    InstanceRoleArn: arn:aws:iam::<ACCOUNT_ID>:role/AppRunnerResumeAnalyze
  HealthCheckConfiguration:
    Protocol: HTTP
    Path: /api/health
    Interval: 10
    Timeout: 5
    HealthyThreshold: 1
    UnhealthyThreshold: 3
```

## `deploy.yml` Changes

- Remove: `deploy-homelab` job (all Tailscale + SSH steps)
- Remove: `TAILSCALE_AUTHKEY`, `HOMELAB_SSH_KEY`, `HOMELAB_SSH_HOST_KEY`, `HOMELAB_USER`, `HOMELAB_HOST` from required secrets comment
- Add: `deploy-apprunner` job (OIDC re-auth + `aws apprunner start-deployment`)
- Add: `APP_RUNNER_SERVICE_ARN` to required secrets comment

## `aws-maintenance.md` Changes

Minor updates:
- Fix "Verify all seven SSM parameters exist" → references Secrets Manager (not SSM Parameter Store)
- Remove references to non-existent `infra/apprunner.yaml` CLI creation steps
- Add "Pause/resume service" cost tip to the top (easy money-saver for beta)

## Out of Scope

- Custom domain setup (deferred — use App Runner default URL for beta)
- Homelab deployment (deferred to separate doc)
- CloudFront CDN (not needed at 5–50 users)
- RDS migration from Neon (future option if Neon free tier exceeded)
- Multi-region deployment

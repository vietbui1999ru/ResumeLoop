---
title: "Manual Setup Checklist"
description: "Every platform credential, key, secret, and one-time config step needed to run ResumeLoop end-to-end."
tags: [setup, deployment, secrets, credentials]
updated: 2026-05-12
---

# Manual Setup Checklist

> **⚠️ DEPRECATED — cloud-era doc.** Lists the platform credentials, keys, and secrets the frozen cloud build needed (preserved on `legacy/cloud-v1`, tag `v1.0-cloud-final`). Local-first ResumeLoop needs **no credentials or secrets** — the brain is your own AI CLI and there is no cloud account. See onboarding in [README](../README.md), and [`DEPRECATED.md`](../DEPRECATED.md) / [ADR 0001](adr/0001-pivot-to-local-first.md).

Everything that can't be scripted: platform logins, key generation, copy-paste secrets, and one-time toggles. Work top-to-bottom — each section depends on the previous.

---

## 1. AWS account

### 1a. Install AWS CLI and configure credentials

```bash
# macOS
brew install awscli

# Verify
aws --version
```

Log in with an account that has admin permissions (or at minimum: ECR, S3, IAM, Secrets Manager):

```bash
aws configure
# AWS Access Key ID:     <from IAM console → your user → Security credentials>
# AWS Secret Access Key: <same>
# Default region:        us-east-1
# Default output format: json
```

### 1b. Run the one-shot provisioner

This creates ECR, S3, Secrets Manager placeholders, the OIDC identity provider, and the GitHub Actions IAM role. Run it once from the repo root:

```bash
bash infra/setup-aws.sh
```

**Copy the output** — you'll need these values in later steps:

```
✓ Setup complete. Add these to GitHub Secrets:
  AWS_DEPLOY_ROLE_ARN = arn:aws:iam::<account-id>:role/GitHubActionsResumeLoop

ECR registry: <account-id>.dkr.ecr.us-east-1.amazonaws.com
S3 bucket:    resumeloop-outputs-<account-id>
```

### 1c. Fill in Secrets Manager values

The script creates placeholder secrets. Replace them with real values:

```bash
# Auth secret — random 32+ char string
aws secretsmanager update-secret \
  --secret-id resumeloop/prod/AUTH_SECRET \
  --secret-string "$(openssl rand -base64 32)"

# Encryption key — 32-byte hex
aws secretsmanager update-secret \
  --secret-id resumeloop/prod/ENCRYPTION_KEY \
  --secret-string "$(openssl rand -hex 32)"

# App mode
aws secretsmanager update-secret \
  --secret-id resumeloop/prod/APP_MODE \
  --secret-string "cloud"

# S3 bucket name (from setup-aws.sh output above)
aws secretsmanager update-secret \
  --secret-id resumeloop/prod/S3_BUCKET \
  --secret-string "resumeloop-outputs-<account-id>"

# AWS region
aws secretsmanager update-secret \
  --secret-id resumeloop/prod/AWS_REGION \
  --secret-string "us-east-1"

# Fill these after you have the Neon DB and app URL (later steps):
# aws secretsmanager update-secret --secret-id resumeloop/prod/DATABASE_URL --secret-string "postgresql://..."
# aws secretsmanager update-secret --secret-id resumeloop/prod/NEXTAUTH_URL  --secret-string "https://..."
```

---

## 2. Homelab LXC — one-time setup

SSH into your Proxmox LXC (or any Docker-capable Linux host).

### 2a. Install Docker and AWS CLI

```bash
# Debian/Ubuntu
apt update && apt install -y docker.io docker-compose-plugin awscli

# Alpine (if using Alpine LXC)
apk add docker docker-cli-compose aws-cli
```

Enable and start Docker:

```bash
systemctl enable docker && systemctl start docker
```

### 2b. Configure AWS credentials for ECR pull

Create an IAM user (`resumeloop-homelab`) in the AWS console with the `AmazonEC2ContainerRegistryReadOnly` managed policy. Generate an access key for it.

```bash
# On the homelab LXC
aws configure
# AWS Access Key ID:     <homelab IAM user key>
# AWS Secret Access Key: <homelab IAM user secret>
# Default region:        us-east-1
# Default output:        json
```

### 2c. Install Tailscale

```bash
# Debian/Ubuntu
curl -fsSL https://tailscale.com/install.sh | sh
tailscale up
```

Follow the link it prints to authenticate. After joining your tailnet, note the machine's Tailscale hostname:

```bash
tailscale status   # shows hostname and IP
```

You'll use the Tailscale hostname as `HOMELAB_HOST` in GitHub Secrets.

### 2d. Create deploy user and SSH key

On your **local machine** (not the homelab), generate the deploy key:

```bash
ssh-keygen -t ed25519 -C "resumeloop-deploy" -f ~/.ssh/resumeloop_deploy
# No passphrase — GitHub Actions needs unattended access
```

Copy the public key to the homelab:

```bash
ssh-copy-id -i ~/.ssh/resumeloop_deploy.pub <user>@<homelab-tailscale-hostname>
# Or manually: cat ~/.ssh/resumeloop_deploy.pub >> ~/.ssh/authorized_keys on the LXC
```

**Get the known_hosts entry** (needed for GitHub Secrets):

```bash
ssh-keyscan <homelab-tailscale-hostname>
# Copy the full line — paste it as HOMELAB_SSH_HOST_KEY below
```

**Get the private key contents** (needed for GitHub Secrets):

```bash
cat ~/.ssh/resumeloop_deploy
# Copy the full PEM block including -----BEGIN/END----- lines
```

### 2e. Create app directory and config files

```bash
# On the homelab LXC
mkdir -p ~/resumeloop/pipeline
cd ~/resumeloop

# Copy compose file from the repo (or wget from your fork)
# Copy and fill .env.prod
cp /path/to/repo/.env.prod.example .env.prod
```

Edit `.env.prod` — every value marked `<...>` must be replaced:

```bash
nano ~/resumeloop/.env.prod
```

```
ECR_REGISTRY=<account-id>.dkr.ecr.us-east-1.amazonaws.com
IMAGE_TAG=latest
OBSIDIAN_JOBS_PATH=/home/<user>/Obsidian/References/Jobs   # path to your JD markdown files
OUTPUT_PATH=/home/<user>/resume-output                      # where DOCX files land
DB_PATH=/home/<user>/resumeloop/resume.db
PIPELINE_DATA_PATH=/home/<user>/resumeloop/pipeline/master_resume_data.json

AUTH_SECRET=<same value you put in Secrets Manager>
NEXTAUTH_URL=https://<tailscale-hostname>                   # or http://localhost:3010 for local-only

APP_MODE=local
ENCRYPTION_KEY=<same value you put in Secrets Manager>
BATCH_CONCURRENCY=3
```

Seed required files:

```bash
touch ~/resumeloop/resume.db   # compose volume mount requires file to exist
# Copy master_resume_data.json from repo if not already there:
cp /path/to/repo/pipeline/master_resume_data.json ~/resumeloop/pipeline/
```

---

## 3. Tailscale admin — ephemeral auth key

GitHub Actions joins your Tailscale network to reach the homelab over SSH. It needs an **ephemeral** auth key so the runner node is automatically cleaned up after the job.

1. Go to **Tailscale Admin → Settings → Keys → Generate auth key**
2. Check **Ephemeral** and **Pre-authorized**
3. Copy the key (starts with `tskey-auth-...`)
4. Paste it as `TAILSCALE_AUTHKEY` in GitHub Secrets (next section)

Ephemeral keys expire — regenerate and update the secret whenever GitHub Actions starts failing with Tailscale auth errors.

---

## 4. GitHub repository secrets

Go to your repo → **Settings → Secrets and variables → Actions → New repository secret**.

Add all of these:

| Secret name | Where to get the value |
|---|---|
| `AWS_DEPLOY_ROLE_ARN` | Output of `bash infra/setup-aws.sh` |
| `TAILSCALE_AUTHKEY` | Tailscale Admin → Settings → Keys → Generate auth key (Ephemeral) |
| `HOMELAB_SSH_KEY` | Full contents of `~/.ssh/resumeloop_deploy` (private key PEM block) |
| `HOMELAB_SSH_HOST_KEY` | Output of `ssh-keyscan <homelab-tailscale-hostname>` |
| `HOMELAB_USER` | SSH username on the LXC (e.g. `root`) |
| `HOMELAB_HOST` | Tailscale hostname of the LXC (e.g. `my-proxmox-lxc`) |
| `CLAUDE_CODE_OAUTH_TOKEN` | Claude.ai → Account → Claude Code → OAuth token (see below) |

### Get `CLAUDE_CODE_OAUTH_TOKEN`

Used by the `claude-code-review.yml`, `claude.yml`, and `council-review.yml` workflows to run Claude Code on PRs.

1. Go to **claude.ai** → click your avatar → **Settings**
2. Find **Claude Code** section → **Generate OAuth token**
3. Copy the token and add it as `CLAUDE_CODE_OAUTH_TOKEN`

### Enable Actions write permissions

The `council-review.yml` workflow commits and pushes fixes. This requires:

Repo → **Settings → Actions → General → Workflow permissions** → select **Read and write permissions**. Also check **Allow GitHub Actions to create and approve pull requests**.

---

## 5. AI provider API keys (in-app Settings UI)

These are stored encrypted in SQLite — they do **not** go in `.env` or GitHub Secrets. After the app is running, open `http://localhost:3010/settings` (or your Tailscale URL) and configure whichever providers you want.

| Provider | Where to get the key | Key prefix |
|---|---|---|
| **Anthropic** | console.anthropic.com → API Keys | `sk-ant-` |
| **OpenAI** | platform.openai.com → API Keys | `sk-` |
| **Google Gemini** | aistudio.google.com → Get API Key | `AIza` |
| **Groq** | console.groq.com → API Keys | `gsk_` |
| **OpenRouter** | openrouter.ai → Keys | `sk-or-` |
| **Ollama** | No key needed — just set the URL (`http://host.docker.internal:11434/v1`) | — |

At minimum, configure **Anthropic** — the chat feature (`/chat` route) requires it.

Default models used if you don't override:

| Provider | Default model |
|---|---|
| Anthropic | `claude-sonnet-4-6` |
| OpenAI | `gpt-4o-mini` |
| Google | `gemini-2.5-flash` |
| Groq | `llama-3.3-70b-versatile` |
| Ollama | `gemma4:e2b` |

---

## 6. First deploy verification

Once secrets are in place, push to `main` or manually trigger the deploy workflow:

```bash
# Trigger manually from CLI
gh workflow run deploy.yml --ref main
```

Watch it run:

```bash
gh run list --workflow=deploy.yml --limit 5
gh run watch <run-id>
```

After deploy completes, verify the app is healthy on the homelab:

```bash
# From the homelab LXC
curl http://localhost:3010/api/health
# Expected: {"ok":true,"version":"...","ts":...}
```

---

## 7. Local development setup

For running the app locally without Docker:

```bash
cp .env.local.example .env.local 2>/dev/null || touch .env.local
```

Minimum `.env.local` contents:

```bash
AUTH_SECRET=any-random-string-at-least-32-chars
NEXTAUTH_URL=http://localhost:3000
ENCRYPTION_KEY=$(openssl rand -hex 32)   # run once, paste the value
```

Optional (override auto-defaults):

```bash
OBSIDIAN_JOBS_PATH=/path/to/your/JobData/Jobs
OUTPUT_PATH=/path/to/your/output
DB_PATH=./resume.db
```

Then:

```bash
npm install
npm run dev
# open http://localhost:3000
```

---

## Summary — what each secret/key controls

| Item | Used by | What breaks without it |
|---|---|---|
| `AWS_DEPLOY_ROLE_ARN` | `deploy.yml` | Cannot push image to ECR |
| `TAILSCALE_AUTHKEY` | `deploy.yml` | Runner can't reach homelab |
| `HOMELAB_SSH_KEY` | `deploy.yml` | Cannot SSH to homelab |
| `HOMELAB_SSH_HOST_KEY` | `deploy.yml` | SSH fails host verification |
| `HOMELAB_USER` / `HOMELAB_HOST` | `deploy.yml` | SSH target unknown |
| `CLAUDE_CODE_OAUTH_TOKEN` | `claude*.yml`, `council-review.yml` | Auto-review workflows fail |
| `AUTH_SECRET` | App runtime | Session signing broken — all logins fail |
| `ENCRYPTION_KEY` | App runtime | Stored AI keys unreadable |
| AI provider keys (in-app) | Chat, generation routes | LLM calls fail |
| Tailscale ephemeral key | `deploy.yml` | Deploy job fails to join tailnet |

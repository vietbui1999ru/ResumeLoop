# AWS Deployment & Setup — Design Spec

**Date:** 2026-05-13
**Branch:** worktree-feat+cicd-pipelines
**Status:** Approved (updated — App Runner deprecated Apr 30 2026, replaced with ECS Fargate)

## Goal

Write a detailed, accurate AWS deployment guide for a beta/demo web app with user auth, persistent accounts, and encrypted API key storage. Target: 5–50 users, ECS Fargate as compute, Neon as database, API Gateway HTTPS URL (no custom domain for beta), CloudFront for CDN.

## Target Architecture

```
GitHub Actions
  ├─ OIDC auth → AWS (no stored keys)
  ├─ docker build → ECR push (SHA tag + latest)
  ├─ ecs update-service → new task starts (new public IP)
  └─ get task public IP → update API Gateway integration URL

Client (HTTPS)
  → CloudFront (CDN — caches static JS/CSS at edge, ~$0/mo at beta scale)
  → API Gateway HTTP API ($1/mil reqs, $0 base, handles TLS)
  → ECS Fargate task (ARM on-demand, public subnet, HTTP:3000)
      → Neon Postgres (DATABASE_URL, pooled connection)
      → S3 (DOCX/PDF storage)
      ← Secrets Manager (7 secrets injected at container startup via entrypoint)
```

**No ALB** — saves ~$16/mo. API Gateway handles TLS termination; Fargate receives plain HTTP internally. No Caddy or TLS changes needed in the container.

### Why this stack

| Concern | Solution | Cost |
|---|---|---|
| Compute | ECS Fargate ARM on-demand, 0.25vCPU/0.5GB, min 1 task | ~$9/mo |
| HTTPS + stable URL | API Gateway HTTP API | ~$1/mo at beta traffic |
| Static asset speed | CloudFront CDN | ~$0/mo (1TB free tier) |
| Database | Neon free tier, autosuspend | $0/mo |
| Secrets | Secrets Manager, loaded at startup | ~$0.40/mo |
| Container registry | ECR | ~$0.10/mo |
| **Total** | | **~$10-12/mo** |

**Min 1 task always-on** — eliminates cold starts (30-60s boot) for beta users. At $9/mo, not worth the UX hit of scale-to-zero.

**ARM on-demand over Spot** — Spot saves ~20% but can be evicted mid-request with 2-min notice. On-demand provides stable IP for the API Gateway integration. Spot eviction = new IP = broken API Gateway until next deploy.

### Performance — already implemented

| Fix | Status |
|---|---|
| SSE streaming for generation pipeline | ✓ already in codebase |
| Anthropic prompt caching (`cache_control: ephemeral` on system prompt) | ✓ already in `lib/ai-reason.ts:51` |
| Loading states in GenerationPanel | ✓ already in codebase |
| CloudFront static asset CDN | ← this spec adds it |

## What Already Exists

| Resource | Status |
|---|---|
| `infra/setup-aws.sh` | Creates ECR + S3 + Secrets Manager placeholders + OIDC provider + GitHub Actions IAM role |
| `infra/iam-policy.json` | Task execution role policy (Secrets Manager read + S3 write + ECR pull) |
| `.github/workflows/deploy.yml` | Builds + pushes to ECR, then SSHes to homelab (homelab job replaced) |
| Next.js standalone Docker build | ✓ already in Dockerfile |

## Files Changed

| Action | File | Description |
|---|---|---|
| Rewrite | `docs/deploy.md` | ECS Fargate as primary path, homelab section removed |
| Create | `infra/ecs-task-def.json` | ECS task definition template (replaces apprunner.yaml) |
| Update | `infra/ecs-task-def.json` | Add `secrets` array — ECS injects Secrets Manager values as env vars natively (no AWS CLI in container needed) |
| Update | `docs/aws-maintenance.md` | Fix App Runner references → ECS Fargate |
| Update | `.github/workflows/deploy.yml` | Replace `deploy-homelab` job with `deploy-fargate` job |
| Update | `middleware.ts` | Add API Gateway origin to `SAFE_ORIGINS` |

## `docs/deploy.md` Structure

### Architecture overview
Diagram + table explaining each service's role before any commands.

### Prerequisites
- AWS account + AWS CLI v2 (`aws configure`)
- Docker installed locally
- GitHub repository with Actions enabled
- Neon account (free at neon.tech)

### Part 1 — One-time AWS infra
```bash
bash infra/setup-aws.sh
```
Creates: ECR repo, S3 bucket, 7 Secrets Manager placeholders, GitHub OIDC provider, `GitHubActionsResumeLoop` IAM role (ECR push).

After script completes, add two more permissions to the GitHub Actions role:
```bash
# Allow ECS deploy + CloudFront invalidation from CI
aws iam put-role-policy \
  --role-name GitHubActionsResumeLoop \
  --policy-name ECSAndCFDeploy \
  --policy-document '{
    "Version":"2012-10-17",
    "Statement":[
      {"Effect":"Allow","Action":["ecs:UpdateService","ecs:DescribeTasks","ecs:ListTasks"],"Resource":"*"},
      {"Effect":"Allow","Action":"cloudfront:CreateInvalidation","Resource":"*"}
    ]
  }'
```

Also create the ECS task execution role (needed for ECR pull + Secrets Manager at task startup):
```bash
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)

aws iam create-role \
  --role-name ECSTaskResumeLoop \
  --assume-role-policy-document '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"ecs-tasks.amazonaws.com"},"Action":"sts:AssumeRole"}]}'

sed "s/<ACCOUNT_ID>/$ACCOUNT_ID/g" infra/iam-policy.json > /tmp/policy.json

aws iam put-role-policy \
  --role-name ECSTaskResumeLoop \
  --policy-name ResumeLoopPolicy \
  --policy-document file:///tmp/policy.json

# Standard ECS execution role policy (ECR pull + CloudWatch logs)
aws iam attach-role-policy \
  --role-name ECSTaskResumeLoop \
  --policy-arn arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy
```

### Part 2 — Neon database
1. Sign up at neon.tech → create project `resumeloop` → region `us-east-1`
2. Dashboard → Connection Details → copy **Pooled connection string**
3. Format: `postgresql://user:pass@host/dbname?sslmode=require`

### Part 3 — Fill Secrets Manager values

| Secret path | Value | How to get it |
|---|---|---|
| `resumeloop/prod/APP_MODE` | `cloud` | Literal |
| `resumeloop/prod/DATABASE_URL` | Neon pooled string | Neon dashboard |
| `resumeloop/prod/AUTH_SECRET` | `openssl rand -hex 32` | Run locally |
| `resumeloop/prod/ENCRYPTION_KEY` | `openssl rand -hex 32` | Run locally |
| `resumeloop/prod/NEXTAUTH_URL` | API Gateway URL | Fill after Part 5 |
| `resumeloop/prod/S3_BUCKET` | `resumeloop-outputs-<account-id>` | Output of setup script |
| `resumeloop/prod/AWS_REGION` | `us-east-1` | Literal |

```bash
aws secretsmanager update-secret \
  --secret-id resumeloop/prod/<NAME> \
  --secret-string "<value>"
```

### Part 4 — ECS cluster + task definition

```bash
# Create cluster (free — you pay for tasks, not the cluster)
aws ecs create-cluster --cluster-name resumeloop

# Register task definition (fills ACCOUNT_ID automatically)
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
ECR_REGISTRY="${ACCOUNT_ID}.dkr.ecr.us-east-1.amazonaws.com"
sed -e "s|<ACCOUNT_ID>|$ACCOUNT_ID|g" \
    -e "s|<ECR_REGISTRY>|$ECR_REGISTRY|g" \
    infra/ecs-task-def.json > /tmp/task-def.json
aws ecs register-task-definition --cli-input-json file:///tmp/task-def.json
```

### Part 5 — ECS service + API Gateway (Console — callout boxes)

**> Console:** ECS → Clusters → resumeloop → Create service

Exact field values:
- Launch type: Fargate
- Architecture: ARM64
- Task definition: `resumeloop` (latest)
- Service name: `resumeloop`
- Desired tasks: `1`
- Networking: public subnet, assign public IP enabled, security group allows inbound TCP 3000
- No load balancer

After service is running, get the task's public IP:
```bash
TASK_ARN=$(aws ecs list-tasks --cluster resumeloop --query 'taskArns[0]' --output text)
PUBLIC_IP=$(aws ecs describe-tasks --cluster resumeloop --tasks $TASK_ARN \
  --query 'tasks[0].attachments[0].details[?name==`networkInterfaceId`].value' \
  --output text | xargs -I{} aws ec2 describe-network-interfaces \
  --network-interface-ids {} \
  --query 'NetworkInterfaces[0].Association.PublicIp' --output text)
echo "Task public IP: $PUBLIC_IP"
```

**> Console:** API Gateway → HTTP APIs → Create

- Name: `resumeloop`
- Integration: HTTP, URL `http://$PUBLIC_IP:3000`
- Route: `$default` → ANY → `/`
- Stage: `$default` (auto-deploy)

Copy the API Gateway invoke URL — this is your app's HTTPS URL.

Update `NEXTAUTH_URL` secret:
```bash
aws secretsmanager update-secret \
  --secret-id resumeloop/prod/NEXTAUTH_URL \
  --secret-string "https://<api-gateway-id>.execute-api.us-east-1.amazonaws.com"
```

### Part 6 — CloudFront distribution (Console)

**> Console:** CloudFront → Create distribution

- Origin domain: API Gateway invoke URL (without `https://`)
- Viewer protocol policy: Redirect HTTP to HTTPS
- Cache policy: `CachingDisabled` for API routes (`/api/*`), `CachingOptimized` for `/_next/static/*`
- Price class: Use only North America and Europe (cheapest for beta)

CloudFront gives you a `*.cloudfront.net` URL. Use this as the primary URL for your beta users — static assets served from edge, API calls proxied through.

### Part 7 — Update deploy.yml
Replace `deploy-homelab` with `deploy-fargate`:

```yaml
deploy-fargate:
  name: Deploy to ECS Fargate
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

    - name: Update ECS service to latest image
      env:
        ECR_REGISTRY: ${{ needs.build-push.outputs.ecr_registry }}
        IMAGE_TAG: ${{ needs.build-push.outputs.image_tag }}
      run: |
        # Force new deployment — pulls latest image
        aws ecs update-service \
          --cluster resumeloop \
          --service resumeloop \
          --force-new-deployment

        # Wait for new task to be running
        aws ecs wait services-stable \
          --cluster resumeloop \
          --services resumeloop

        # Get new task's public IP
        TASK_ARN=$(aws ecs list-tasks --cluster resumeloop \
          --service-name resumeloop --query 'taskArns[0]' --output text)
        ENI_ID=$(aws ecs describe-tasks --cluster resumeloop --tasks $TASK_ARN \
          --query 'tasks[0].attachments[0].details[?name==`networkInterfaceId`].value' \
          --output text)
        PUBLIC_IP=$(aws ec2 describe-network-interfaces \
          --network-interface-ids $ENI_ID \
          --query 'NetworkInterfaces[0].Association.PublicIp' --output text)

        # Update API Gateway integration to new IP
        INTEGRATION_ID=$(aws apigatewayv2 get-integrations \
          --api-id ${{ secrets.API_GATEWAY_ID }} \
          --query 'Items[0].IntegrationId' --output text)
        aws apigatewayv2 update-integration \
          --api-id ${{ secrets.API_GATEWAY_ID }} \
          --integration-id $INTEGRATION_ID \
          --integration-uri "http://$PUBLIC_IP:3000"

        # Invalidate CloudFront cache for static assets
        aws cloudfront create-invalidation \
          --distribution-id ${{ secrets.CLOUDFRONT_DISTRIBUTION_ID }} \
          --paths "/_next/static/*"
```

### Part 8 — GitHub secrets

| Secret | Value |
|---|---|
| `AWS_DEPLOY_ROLE_ARN` | Output of `setup-aws.sh` |
| `API_GATEWAY_ID` | From API Gateway console → API ID |
| `CLOUDFRONT_DISTRIBUTION_ID` | From CloudFront console → Distribution ID |

Remove homelab secrets: `TAILSCALE_AUTHKEY`, `HOMELAB_SSH_KEY`, `HOMELAB_SSH_HOST_KEY`, `HOMELAB_USER`, `HOMELAB_HOST`

### Part 9 — First deployment + verify
```bash
git push origin main
```

Monitor ECS deployment:
```bash
aws ecs describe-services \
  --cluster resumeloop --services resumeloop \
  --query 'services[0].{Status:status,Running:runningCount,Desired:desiredCount}'
```

Verify via CloudFront URL:
```bash
curl https://<distribution>.cloudfront.net/api/health
```

## `infra/ecs-task-def.json` — Task Definition Template

ECS natively injects Secrets Manager values as env vars via the `secrets` array in the container definition — no AWS CLI in the container, no entrypoint script, no Dockerfile changes needed. The `executionRoleArn` handles the permission to fetch secrets at task startup.

```json
{
  "family": "resumeloop",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "256",
  "memory": "512",
  "runtimePlatform": { "cpuArchitecture": "ARM64", "operatingSystemFamily": "LINUX" },
  "executionRoleArn": "arn:aws:iam::<ACCOUNT_ID>:role/ECSTaskResumeLoop",
  "taskRoleArn": "arn:aws:iam::<ACCOUNT_ID>:role/ECSTaskResumeLoop",
  "containerDefinitions": [{
    "name": "app",
    "image": "<ECR_REGISTRY>/resumeloop:latest",
    "portMappings": [{ "containerPort": 3000, "protocol": "tcp" }],
    "logConfiguration": {
      "logDriver": "awslogs",
      "options": {
        "awslogs-group": "/ecs/resumeloop",
        "awslogs-region": "us-east-1",
        "awslogs-stream-prefix": "app",
        "awslogs-create-group": "true"
      }
    },
    "secrets": [
      {"name":"APP_MODE",       "valueFrom":"arn:aws:secretsmanager:us-east-1:<ACCOUNT_ID>:secret:resumeloop/prod/APP_MODE"},
      {"name":"DATABASE_URL",   "valueFrom":"arn:aws:secretsmanager:us-east-1:<ACCOUNT_ID>:secret:resumeloop/prod/DATABASE_URL"},
      {"name":"AUTH_SECRET",    "valueFrom":"arn:aws:secretsmanager:us-east-1:<ACCOUNT_ID>:secret:resumeloop/prod/AUTH_SECRET"},
      {"name":"ENCRYPTION_KEY", "valueFrom":"arn:aws:secretsmanager:us-east-1:<ACCOUNT_ID>:secret:resumeloop/prod/ENCRYPTION_KEY"},
      {"name":"NEXTAUTH_URL",   "valueFrom":"arn:aws:secretsmanager:us-east-1:<ACCOUNT_ID>:secret:resumeloop/prod/NEXTAUTH_URL"},
      {"name":"S3_BUCKET",      "valueFrom":"arn:aws:secretsmanager:us-east-1:<ACCOUNT_ID>:secret:resumeloop/prod/S3_BUCKET"},
      {"name":"AWS_REGION",     "valueFrom":"arn:aws:secretsmanager:us-east-1:<ACCOUNT_ID>:secret:resumeloop/prod/AWS_REGION"}
    ],
    "essential": true
  }]
}
```

## `middleware.ts` Update

Add API Gateway origin to `SAFE_ORIGINS` (needed for mutating requests from the browser via API GW):
```typescript
const SAFE_ORIGINS = new Set([
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  process.env.NEXTAUTH_URL,  // API Gateway / CloudFront URL in production
].filter(Boolean))
```

## `aws-maintenance.md` Changes

- Replace all App Runner references with ECS Fargate equivalents
- Update "Rollback" section: `aws ecs update-service --task-definition <family>:<revision>`
- Update "Logs" section: CloudWatch log group `/ecs/resumeloop`
- Update "Scaling" section: ECS service desired count + auto-scaling policies
- Update "Pause service (stop billing)": `aws ecs update-service --desired-count 0`

## Cost Summary

| Service | Monthly cost |
|---|---|
| ECS Fargate ARM 0.25vCPU/0.5GB × 1 task | ~$9/mo |
| API Gateway HTTP API (beta traffic) | ~$1/mo |
| CloudFront (1TB free tier) | ~$0/mo |
| Neon free tier | $0/mo |
| Secrets Manager (7 secrets) | ~$0.40/mo |
| ECR storage | ~$0.10/mo |
| **Total** | **~$10-11/mo** |

Pause service when not in use: `aws ecs update-service --cluster resumeloop --service resumeloop --desired-count 0` → $0/mo idle.

## Out of Scope

- Custom domain (deferred — use CloudFront/API GW default URLs for beta)
- Homelab deployment (deferred to separate doc)
- ECS auto-scaling beyond manual desired-count changes
- Fargate Spot (IP instability incompatible with API Gateway direct integration)
- RDS migration from Neon

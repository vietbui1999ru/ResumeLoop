---
title: "AWS Maintenance Runbook"
description: "Operational runbook for the ResumeLoop App Runner deployment: monitoring, deployments, scaling, secrets rotation, cost management, and troubleshooting."
tags: [aws, operations, runbook, app-runner]
updated: 2026-05-11
---

# AWS Maintenance Runbook

Operational reference for the production deployment on AWS App Runner. See [docs/deploy.md](./deploy.md) for initial setup.

---

## Monitoring

### Application health

```bash
curl https://<ServiceUrl>/api/health
```

### App Runner service status

```bash
aws apprunner describe-service \
  --service-arn <APP_RUNNER_SERVICE_ARN> \
  --query 'Service.{Status:Status,URL:ServiceUrl,Updated:UpdatedAt}'
```

Expected `Status`: `RUNNING`. Other values: `OPERATION_IN_PROGRESS` (deployment in progress), `PAUSED`, `DELETED`.

### CloudWatch logs

App Runner streams stdout to CloudWatch under the log group `/aws/apprunner/resumeloop/<service-id>/application`.

Tail live:

```bash
# Get the log group name first
aws logs describe-log-groups \
  --log-group-name-prefix /aws/apprunner/resumeloop \
  --query 'logGroups[].logGroupName'

# Then tail
aws logs tail /aws/apprunner/resumeloop/<service-id>/application --follow
```

Filter for errors only:

```bash
aws logs filter-log-events \
  --log-group-name /aws/apprunner/resumeloop/<service-id>/application \
  --filter-pattern "ERROR" \
  --start-time $(date -v-1H +%s000)
```

### Recent deployments

```bash
aws apprunner list-operations \
  --service-arn <APP_RUNNER_SERVICE_ARN> \
  --query 'OperationSummaryList[:5].{Type:Type,Status:Status,Started:StartedAt}'
```

---

## Deployments

### Automatic (normal path)

Push to `main` → GitHub Actions builds the Docker image, pushes to ECR, calls `aws apprunner start-deployment`. The workflow file is `.github/workflows/deploy.yml`.

Note: `AutoDeploymentsEnabled: false` in `infra/apprunner.yaml`. App Runner does not watch ECR itself; the GitHub Actions step triggers the deployment explicitly.

### Manual redeploy (same image)

Redeploys the current `latest` image without a code change — useful after rotating secrets or changing SSM parameters.

```bash
aws apprunner start-deployment --service-arn <APP_RUNNER_SERVICE_ARN>
```

### Rollback to a previous image

GitHub Actions tags every image with both `latest` and the git SHA. To roll back:

1. Find the SHA you want:

```bash
# In the repo
git log --oneline -10
```

2. Update the App Runner service to use the SHA-tagged image:

```bash
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
ECR_REGISTRY=$(aws ecr describe-repositories \
  --repository-names resumeloop \
  --query 'repositories[0].repositoryUri' \
  --output text)

aws apprunner update-service \
  --service-arn <APP_RUNNER_SERVICE_ARN> \
  --source-configuration "{
    \"ImageRepository\": {
      \"ImageIdentifier\": \"$ECR_REGISTRY:<SHA>\",
      \"ImageRepositoryType\": \"ECR\"
    }
  }"
```

3. Trigger the deployment:

```bash
aws apprunner start-deployment --service-arn <APP_RUNNER_SERVICE_ARN>
```

4. After rollback is confirmed stable, restore to `latest` by reverting the git commit and pushing.

---

## Scaling

The current configuration in `infra/apprunner.yaml`:

```yaml
InstanceConfiguration:
  Cpu: "0.5 vCPU"
  Memory: "1 GB"
```

### Upgrade compute size

For concurrent resume generation workloads, `1 vCPU / 2 GB` is recommended.

```bash
aws apprunner update-service \
  --service-arn <APP_RUNNER_SERVICE_ARN> \
  --instance-configuration '{"Cpu": "1 vCPU", "Memory": "2 GB"}'
```

Valid combinations: `0.25 vCPU / 0.5 GB`, `0.5 vCPU / 1 GB`, `1 vCPU / 2 GB`, `2 vCPU / 4 GB`.

### Concurrency and auto-scaling

App Runner auto-scales instances based on concurrent requests. To configure:

```bash
# Create an auto-scaling configuration
aws apprunner create-auto-scaling-configuration \
  --auto-scaling-configuration-name resumeloop-scaling \
  --max-concurrency 25 \
  --min-size 1 \
  --max-size 3

# Attach it to the service (get the ARN from the above output)
aws apprunner update-service \
  --service-arn <APP_RUNNER_SERVICE_ARN> \
  --auto-scaling-configuration-arn <AUTO_SCALING_CONFIG_ARN>
```

`MaxConcurrency` is the number of concurrent requests per instance before a new instance is started.

### Pause the service (stop billing)

When not in use, pause the service to stop compute charges (you still pay for stored ECR images and SSM params, but those are negligible).

```bash
aws apprunner pause-service --service-arn <APP_RUNNER_SERVICE_ARN>

# Resume later
aws apprunner resume-service --service-arn <APP_RUNNER_SERVICE_ARN>
```

---

## Secrets rotation

All secrets are in Secrets Manager under `resumeloop/prod/`. After updating a secret, redeploy the service so the new value is picked up at container startup.

### Rotate ENCRYPTION_KEY

Rotating `ENCRYPTION_KEY` will invalidate any API keys stored in the `user_settings` table (they are encrypted with this key). Warn users before rotating.

```bash
NEW_KEY=$(openssl rand -hex 32)

aws secretsmanager update-secret \
  --secret-id resumeloop/prod/ENCRYPTION_KEY \
  --secret-string "$NEW_KEY"

aws apprunner start-deployment --service-arn <APP_RUNNER_SERVICE_ARN>
```

### Rotate AUTH_SECRET

Rotating `AUTH_SECRET` invalidates all active user sessions — everyone will be logged out.

```bash
NEW_SECRET=$(openssl rand -base64 32)

aws secretsmanager update-secret \
  --secret-id resumeloop/prod/AUTH_SECRET \
  --secret-string "$NEW_SECRET"

aws apprunner start-deployment --service-arn <APP_RUNNER_SERVICE_ARN>
```

### Rotate DATABASE_URL (Neon)

1. Rotate the password in the Neon dashboard (Project → Settings → Reset password)
2. Copy the new connection string
3. Update the secret:

```bash
aws secretsmanager update-secret \
  --secret-id resumeloop/prod/DATABASE_URL \
  --secret-string "postgresql://user:NEWPASS@host/dbname?sslmode=require"

aws apprunner start-deployment --service-arn <APP_RUNNER_SERVICE_ARN>
```

---

## Cost management

### App Runner

Billed per vCPU-second and memory-GB-second while instances are active. No charge when the service is paused or when no instances are running (after scale-to-zero, if enabled).

At `0.5 vCPU / 1 GB` with one always-on instance, approximate cost is ~$15–25/month depending on usage. Pause when idle to avoid this.

Check current service state:

```bash
aws apprunner describe-service \
  --service-arn <APP_RUNNER_SERVICE_ARN> \
  --query 'Service.Status'
```

### Neon

Free tier: 0.5 GB storage, 1 compute unit. Monitor usage in the [Neon dashboard](https://console.neon.tech) → Project → Metrics.

If storage approaches the limit, archive or delete old rows from `ai_usage_log` and `chat_messages`:

```sql
-- Delete AI usage logs older than 90 days
DELETE FROM ai_usage_log WHERE created_at < NOW() - INTERVAL '90 days';

-- Delete chat messages older than 30 days
DELETE FROM chat_messages WHERE created_at < NOW() - INTERVAL '30 days';
```

### S3

DOCX and PDF outputs accumulate over time. Add an expiration lifecycle rule for old outputs:

```bash
aws s3api put-bucket-lifecycle-configuration \
  --bucket resumeloop-outputs \
  --lifecycle-configuration '{
    "Rules": [{
      "ID": "expire-old-outputs",
      "Status": "Enabled",
      "Filter": { "Prefix": "" },
      "Expiration": { "Days": 365 }
    }]
  }'
```

### ECR

Old images accumulate with each push. Add a lifecycle policy to keep only the last 10 images:

```bash
aws ecr put-lifecycle-policy \
  --repository-name resumeloop \
  --lifecycle-policy-text '{
    "rules": [{
      "rulePriority": 1,
      "selection": {
        "tagStatus": "any",
        "countType": "imageCountMoreThan",
        "countNumber": 10
      },
      "action": { "type": "expire" }
    }]
  }'
```

---

## Troubleshooting

### Container fails to start

Symptom: App Runner shows `OPERATION_IN_PROGRESS` indefinitely or health check fails immediately.

1. Check CloudWatch logs for the startup error:

```bash
aws logs tail /aws/apprunner/resumeloop/<service-id>/application --follow
```

2. Verify all seven SSM parameters exist:

```bash
aws ssm get-parameters-by-path \
  --path /resumeloop/prod \
  --with-decryption \
  --query 'Parameters[].{Name:Name,Value:Value}'
```

3. Verify the instance role ARN in the App Runner service matches `AppRunnerResumeLoopRole`.

### 502 errors from the App Runner URL

1. Verify the health check endpoint responds on port 3000:

```bash
curl https://<ServiceUrl>/api/health
```

2. Check that the App Runner service is configured for port `"3000"` (string, not integer — the YAML spec requires this).

3. Review logs for any uncaught exceptions during request handling.

### Neon connection refused / timeout

1. Check the `DATABASE_URL` SSM parameter is set and formatted correctly (`postgresql://...?sslmode=require`).

2. Verify the Neon project is active (not suspended) in the [Neon dashboard](https://console.neon.tech).

3. Confirm the connection string uses the pooled endpoint (Neon dashboard → Connection Details → Pooled connection) for serverless environments.

### S3 upload fails

1. Verify the IAM policy on `AppRunnerResumeLoopRole` includes `s3:PutObject` on `arn:aws:s3:::resumeloop-outputs/*`.

2. Check `S3_BUCKET` SSM parameter matches the actual bucket name.

3. Confirm `AWS_REGION` SSM parameter matches the region where the bucket was created.

### GitHub Actions deploy fails (OIDC auth error)

1. Verify the `AWS_DEPLOY_ROLE_ARN` secret in GitHub matches the ARN of `GitHubActionsResumeLoopDeploy`.

2. Check the trust policy condition — it restricts to `repo:<ORG>/<REPO>:ref:refs/heads/main`. Deployments from other branches will fail.

3. If the OIDC provider was already present in the account (from another project), skip the `create-open-id-connect-provider` step — it can only be created once per account.

---

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

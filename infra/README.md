# AWS Deployment Setup

ResumeAnalyze runs on AWS App Runner (compute) + Neon serverless Postgres (database) + S3 (DOCX/PDF outputs).

All secrets are stored in AWS Systems Manager Parameter Store and injected at runtime. No secrets live in GitHub or the Docker image.

---

## Prerequisites

- AWS CLI v2 installed and configured (`aws configure`)
- Docker installed locally
- GitHub repository with Actions enabled

Get your account ID (you'll need it throughout):

```bash
aws sts get-caller-identity --query Account --output text
```

---

## 1. ECR repository

```bash
aws ecr create-repository \
  --repository-name resumeanalyze \
  --region us-east-1
```

Note the `repositoryUri` in the output — this is your `<ECR_REGISTRY>`.

---

## 2. S3 bucket

```bash
aws s3api create-bucket \
  --bucket resumeanalyze-outputs \
  --region us-east-1

# Enable versioning
aws s3api put-bucket-versioning \
  --bucket resumeanalyze-outputs \
  --versioning-configuration Status=Enabled

# Lifecycle rule: abort incomplete multipart uploads after 7 days
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

## 3. SSM parameters

Store all secrets as `SecureString` in Parameter Store (standard tier, free).

Replace `<YOUR_VALUE>` with the actual secret for each parameter.

```bash
# App mode — set to "cloud" to enable Neon + S3 paths
aws ssm put-parameter \
  --name /resumeanalyze/prod/APP_MODE \
  --value "cloud" \
  --type SecureString

# Neon connection string (from Neon dashboard → Connection Details)
aws ssm put-parameter \
  --name /resumeanalyze/prod/DATABASE_URL \
  --value "<YOUR_NEON_CONNECTION_STRING>" \
  --type SecureString

# 32-byte hex encryption key for session data
# Generate: openssl rand -hex 32
aws ssm put-parameter \
  --name /resumeanalyze/prod/ENCRYPTION_KEY \
  --value "<YOUR_ENCRYPTION_KEY>" \
  --type SecureString

# NextAuth secret (any random string, min 32 chars)
# Generate: openssl rand -base64 32
aws ssm put-parameter \
  --name /resumeanalyze/prod/NEXTAUTH_SECRET \
  --value "<YOUR_NEXTAUTH_SECRET>" \
  --type SecureString

# Public URL of the App Runner service (set after service is created)
# Format: https://<random>.us-east-1.awsapprunner.com
aws ssm put-parameter \
  --name /resumeanalyze/prod/NEXTAUTH_URL \
  --value "<YOUR_APP_RUNNER_URL>" \
  --type SecureString

# S3 bucket name
aws ssm put-parameter \
  --name /resumeanalyze/prod/S3_BUCKET \
  --value "resumeanalyze-outputs" \
  --type SecureString

# AWS region
aws ssm put-parameter \
  --name /resumeanalyze/prod/AWS_REGION \
  --value "us-east-1" \
  --type SecureString
```

---

## 4. IAM role for App Runner

The App Runner instance needs to read SSM parameters and write to S3.

```bash
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)

# Create the role with App Runner as the trusted principal
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

# Fill in your account ID in the policy file, then attach it
sed "s/<ACCOUNT_ID>/$ACCOUNT_ID/g" infra/iam-policy.json > /tmp/iam-policy-resolved.json

aws iam put-role-policy \
  --role-name AppRunnerResumeAnalyzeRole \
  --policy-name ResumeAnalyzePolicy \
  --policy-document file:///tmp/iam-policy-resolved.json
```

---

## 5. GitHub OIDC → AWS trust (no long-lived secrets)

This lets GitHub Actions assume an AWS role via OIDC — no AWS access keys stored in GitHub.

```bash
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
GITHUB_ORG=<YOUR_GITHUB_USERNAME_OR_ORG>
GITHUB_REPO=ResumeAnalyze

# Create the OIDC provider (one-time per AWS account)
aws iam create-open-id-connect-provider \
  --url https://token.actions.githubusercontent.com \
  --client-id-list sts.amazonaws.com \
  --thumbprint-list 6938fd4d98bab03faadb97b34396831e3780aea1

# Create the deploy role
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

# Attach permissions needed by the deploy job
aws iam attach-role-policy \
  --role-name GitHubActionsResumeAnalyzeDeploy \
  --policy-arn arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryPowerUser

aws iam put-role-policy \
  --role-name GitHubActionsResumeAnalyzeDeploy \
  --policy-name AppRunnerDeploy \
  --policy-document "{
    \"Version\": \"2012-10-17\",
    \"Statement\": [{
      \"Effect\": \"Allow\",
      \"Action\": \"apprunner:StartDeployment\",
      \"Resource\": \"*\"
    }]
  }"
```

---

## 6. App Runner service

Fill in the placeholders in `infra/apprunner.yaml`, then create the service:

```bash
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
ECR_REGISTRY=$(aws ecr describe-repositories \
  --repository-names resumeanalyze \
  --query 'repositories[0].repositoryUri' \
  --output text | sed 's|/resumeanalyze||')

# Substitute placeholders
sed -e "s|<ECR_REGISTRY>|$ECR_REGISTRY|g" \
    -e "s|<ACCOUNT_ID>|$ACCOUNT_ID|g" \
    infra/apprunner.yaml > /tmp/apprunner-resolved.yaml

aws apprunner create-service --cli-input-yaml file:///tmp/apprunner-resolved.yaml
```

Note the `ServiceArn` from the output — you'll need it for the GitHub secret.

After the service is created, note the `ServiceUrl` and update the `NEXTAUTH_URL` SSM parameter:

```bash
aws ssm put-parameter \
  --name /resumeanalyze/prod/NEXTAUTH_URL \
  --value "https://<ServiceUrl>" \
  --type SecureString \
  --overwrite
```

---

## 7. GitHub secrets

In your repository: Settings → Secrets and variables → Actions → New repository secret.

| Secret | Value |
|---|---|
| `AWS_DEPLOY_ROLE_ARN` | `arn:aws:iam::<ACCOUNT_ID>:role/GitHubActionsResumeAnalyzeDeploy` |
| `APP_RUNNER_SERVICE_ARN` | The `ServiceArn` from the `create-service` output |

---

## 8. First deployment

Push to `main`. The workflow will:
1. Authenticate to AWS via OIDC
2. Build and push the Docker image to ECR
3. Trigger an App Runner deployment

Monitor progress:

```bash
aws apprunner list-operations \
  --service-arn <APP_RUNNER_SERVICE_ARN> \
  --query 'OperationSummaryList[0]'
```

Health check is available at: `https://<ServiceUrl>/api/health`

---

## Local dev

Local mode uses SQLite + filesystem (no Neon, no S3). Do not set `APP_MODE=cloud` locally.

See `docker-compose.yml` for local container setup.

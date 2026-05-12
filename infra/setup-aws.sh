#!/usr/bin/env bash
# infra/setup-aws.sh — provision AWS resources for ResumeAnalyze
# Run once: bash infra/setup-aws.sh
# Requires: aws cli v2, AWS credentials with admin permissions

set -euo pipefail

REGION="us-east-1"
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
ECR_REPO="resumeanalyze"
S3_BUCKET="resumeanalyze-outputs-${ACCOUNT_ID}"
SECRET_PREFIX="resumeanalyze/prod"

echo "Account: $ACCOUNT_ID  Region: $REGION"

# ── ECR repository ────────────────────────────────────────────────────────────
echo "Creating ECR repository..."
aws ecr create-repository \
  --repository-name "$ECR_REPO" \
  --region "$REGION" \
  --image-scanning-configuration scanOnPush=true \
  --encryption-configuration encryptionType=AES256 2>/dev/null \
  || echo "ECR repo already exists"

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
for SECRET_NAME in APP_MODE DATABASE_URL ENCRYPTION_KEY AUTH_SECRET NEXTAUTH_URL S3_BUCKET AWS_REGION; do
  aws secretsmanager create-secret \
    --name "${SECRET_PREFIX}/${SECRET_NAME}" \
    --description "ResumeAnalyze ${SECRET_NAME}" \
    --secret-string "REPLACE_ME" \
    --region "$REGION" 2>/dev/null \
    || echo "Secret ${SECRET_NAME} already exists"
done

# ── GitHub OIDC identity provider ─────────────────────────────────────────────
echo "Creating GitHub Actions OIDC identity provider..."
aws iam create-open-id-connect-provider \
  --url https://token.actions.githubusercontent.com \
  --client-id-list sts.amazonaws.com \
  --thumbprint-list 6938fd4d98bab03faadb97b34396831e3780aea1 \
  2>/dev/null || echo "OIDC provider already exists"

# ── GitHub Actions OIDC role ──────────────────────────────────────────────────
echo "Creating GitHub Actions OIDC role..."
GITHUB_REPO="vietbui1999ru/ResumeAnalyze"

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
  --role-name "GitHubActionsResumeAnalyze" \
  --assume-role-policy-document "$TRUST_POLICY" 2>/dev/null \
  || echo "IAM role already exists"

aws iam put-role-policy \
  --role-name "GitHubActionsResumeAnalyze" \
  --policy-name "ECRPush" \
  --policy-document "{
    \"Version\": \"2012-10-17\",
    \"Statement\": [
      {
        \"Effect\": \"Allow\",
        \"Action\": [\"ecr:GetAuthorizationToken\"],
        \"Resource\": \"*\"
      },
      {
        \"Effect\": \"Allow\",
        \"Action\": [
          \"ecr:BatchCheckLayerAvailability\",
          \"ecr:GetDownloadUrlForLayer\",
          \"ecr:BatchGetImage\",
          \"ecr:InitiateLayerUpload\",
          \"ecr:UploadLayerPart\",
          \"ecr:CompleteLayerUpload\",
          \"ecr:PutImage\"
        ],
        \"Resource\": \"arn:aws:ecr:${REGION}:${ACCOUNT_ID}:repository/${ECR_REPO}\"
      }
    ]
  }"

ROLE_ARN=$(aws iam get-role --role-name "GitHubActionsResumeAnalyze" --query "Role.Arn" --output text)
ECR_REGISTRY="${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com"

echo ""
echo "✓ Setup complete. Add these to GitHub Secrets:"
echo "  AWS_DEPLOY_ROLE_ARN = ${ROLE_ARN}"
echo ""
echo "ECR registry: ${ECR_REGISTRY}"
echo "S3 bucket:    ${S3_BUCKET}"
echo ""
echo "Fill Secrets Manager values:"
echo "  aws secretsmanager update-secret --secret-id resumeanalyze/prod/AUTH_SECRET --secret-string '<value>'"

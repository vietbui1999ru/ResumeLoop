#!/usr/bin/env bash
# Provisions an ALB in front of ECS Fargate and wires API Gateway to it.
# Run once from any machine with AWS credentials that have ELB + EC2 + ECS + APIGW perms.
#
# What this does:
#   1. Creates a security group for the ALB (allows :80 from internet)
#   2. Locks the ECS security group to only accept traffic from the ALB
#   3. Creates a Target Group (type: ip, health-checks /api/health)
#   4. Creates an internet-facing ALB across all 6 subnets
#   5. Adds a listener: ALB :80 → Target Group
#   6. Recreates the ECS service with the Target Group wired in
#      (AWS does not allow adding a load balancer to an existing service)
#   7. Updates API Gateway integrations to the ALB DNS (static — no more IP chasing)
#
# After running: remove the "Update API Gateway integrations" step from deploy.yml
#   (that step is now obsolete — ALB routes dynamically)

set -euo pipefail

REGION="us-east-1"
VPC_ID="vpc-0dca68db10ea2c9ba"
ECS_SG="sg-0af0df98b66198878"
CLUSTER="resumeloop"
SERVICE="resumeloop"
CONTAINER_NAME="resumeloop"
CONTAINER_PORT=3000
API_GW_ID="fh7gi2vfe2"
PROXY_INT="4bao5ug"
ROOT_INT="k3p1e6c"

SUBNETS=(
  subnet-0a11d3d06a36acc30
  subnet-07d014d61af92b23c
  subnet-07dadfb5dbe3636ed
  subnet-029661504d2b44ca5
  subnet-02259f0a999617f91
  subnet-03ff1482a497d0850
)
SUBNETS_CSV=$(IFS=,; echo "${SUBNETS[*]}")

# ── 1. ALB security group ────────────────────────────────────────────────────
echo "Creating ALB security group..."
ALB_SG_ID=$(aws ec2 create-security-group \
  --group-name resumeloop-alb-sg \
  --description "resumeloop ALB - allows HTTP from internet" \
  --vpc-id "$VPC_ID" \
  --region "$REGION" \
  --query 'GroupId' --output text)

aws ec2 authorize-security-group-ingress \
  --group-id "$ALB_SG_ID" \
  --protocol tcp --port 80 --cidr 0.0.0.0/0 \
  --region "$REGION" > /dev/null

aws ec2 authorize-security-group-ingress \
  --group-id "$ALB_SG_ID" \
  --ip-permissions '[{"IpProtocol":"tcp","FromPort":80,"ToPort":80,"Ipv6Ranges":[{"CidrIpv6":"::/0"}]}]' \
  --region "$REGION" > /dev/null

echo "  ALB SG: $ALB_SG_ID"

# ── 2. Harden ECS SG: only allow from ALB SG (not open internet) ────────────
echo "Hardening ECS security group..."
aws ec2 authorize-security-group-ingress \
  --group-id "$ECS_SG" \
  --protocol tcp --port "$CONTAINER_PORT" \
  --source-group "$ALB_SG_ID" \
  --region "$REGION" > /dev/null

aws ec2 revoke-security-group-ingress \
  --group-id "$ECS_SG" \
  --protocol tcp --port "$CONTAINER_PORT" --cidr 0.0.0.0/0 \
  --region "$REGION" > /dev/null

echo "  ECS port $CONTAINER_PORT now restricted to ALB only"

# ── 3. Target Group ──────────────────────────────────────────────────────────
echo "Creating Target Group..."
TG_ARN=$(aws elbv2 create-target-group \
  --name resumeloop-tg \
  --protocol HTTP \
  --port "$CONTAINER_PORT" \
  --target-type ip \
  --vpc-id "$VPC_ID" \
  --health-check-path /api/health \
  --health-check-interval-seconds 30 \
  --healthy-threshold-count 2 \
  --unhealthy-threshold-count 3 \
  --matcher HttpCode=200 \
  --region "$REGION" \
  --query 'TargetGroups[0].TargetGroupArn' --output text)

echo "  TG: $TG_ARN"

# ── 4. ALB ───────────────────────────────────────────────────────────────────
echo "Creating ALB (takes ~30s)..."
ALB_ARN=$(aws elbv2 create-load-balancer \
  --name resumeloop-alb \
  --type application \
  --scheme internet-facing \
  --ip-address-type ipv4 \
  --subnets "${SUBNETS[@]}" \
  --security-groups "$ALB_SG_ID" \
  --region "$REGION" \
  --query 'LoadBalancers[0].LoadBalancerArn' --output text)

echo "  Waiting for ALB to become active..."
aws elbv2 wait load-balancer-available \
  --load-balancer-arns "$ALB_ARN" \
  --region "$REGION"

ALB_DNS=$(aws elbv2 describe-load-balancers \
  --load-balancer-arns "$ALB_ARN" \
  --region "$REGION" \
  --query 'LoadBalancers[0].DNSName' --output text)

echo "  ALB DNS: $ALB_DNS"

# ── 5. Listener ──────────────────────────────────────────────────────────────
echo "Creating listener..."
aws elbv2 create-listener \
  --load-balancer-arn "$ALB_ARN" \
  --protocol HTTP \
  --port 80 \
  --default-actions "Type=forward,TargetGroupArn=$TG_ARN" \
  --region "$REGION" > /dev/null

echo "  Listener: ALB :80 → Target Group"

# ── 6. Recreate ECS service with Target Group ────────────────────────────────
# AWS does not allow attaching a load balancer to an existing service.
# We capture the current task definition, delete, and recreate.
echo "Fetching current task definition..."
TASK_DEF=$(aws ecs describe-services \
  --cluster "$CLUSTER" --services "$SERVICE" \
  --region "$REGION" \
  --query 'services[0].taskDefinition' --output text)

echo "  Task def: $TASK_DEF"
echo "Deleting existing ECS service (brief downtime)..."
aws ecs update-service \
  --cluster "$CLUSTER" --service "$SERVICE" \
  --desired-count 0 \
  --region "$REGION" > /dev/null

aws ecs delete-service \
  --cluster "$CLUSTER" --service "$SERVICE" \
  --force --region "$REGION" > /dev/null

echo "  Waiting for service to drain..."
aws ecs wait services-inactive \
  --cluster "$CLUSTER" --services "$SERVICE" \
  --region "$REGION"

echo "Creating ECS service with ALB..."
aws ecs create-service \
  --cluster "$CLUSTER" \
  --service-name "$SERVICE" \
  --task-definition "$TASK_DEF" \
  --desired-count 1 \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[$SUBNETS_CSV],securityGroups=[$ECS_SG],assignPublicIp=ENABLED}" \
  --load-balancers "targetGroupArn=$TG_ARN,containerName=$CONTAINER_NAME,containerPort=$CONTAINER_PORT" \
  --health-check-grace-period-seconds 60 \
  --deployment-configuration "deploymentCircuitBreaker={enable=true,rollback=true},maximumPercent=200,minimumHealthyPercent=100" \
  --region "$REGION" > /dev/null

echo "  Waiting for service to stabilize..."
aws ecs wait services-stable \
  --cluster "$CLUSTER" --services "$SERVICE" \
  --region "$REGION"

echo "  ECS service running with ALB"

# ── 7. Update API Gateway ────────────────────────────────────────────────────
echo "Updating API Gateway integrations..."
aws apigatewayv2 update-integration \
  --api-id "$API_GW_ID" \
  --integration-id "$PROXY_INT" \
  --integration-uri "http://$ALB_DNS/{proxy}" \
  --region "$REGION" > /dev/null

aws apigatewayv2 update-integration \
  --api-id "$API_GW_ID" \
  --integration-id "$ROOT_INT" \
  --integration-uri "http://$ALB_DNS" \
  --region "$REGION" > /dev/null

echo "  API Gateway → $ALB_DNS"

# ── Done ─────────────────────────────────────────────────────────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo " ALB setup complete"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo " ALB DNS : $ALB_DNS"
echo " ALB SG  : $ALB_SG_ID"
echo " TG ARN  : $TG_ARN"
echo ""
echo " API Gateway integrations now point to the ALB."
echo " The IP-update step in deploy.yml is now obsolete — remove it."
echo ""
echo " Verify:"
echo "   curl https://fh7gi2vfe2.execute-api.us-east-1.amazonaws.com/api/health"

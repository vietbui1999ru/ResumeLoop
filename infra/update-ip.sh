#!/usr/bin/env bash
# Update API Gateway integrations after ECS task restart (new public IP).
# Usage: ./infra/update-ip.sh [--no-wait]
set -euo pipefail

API_ID=fh7gi2vfe2
PROXY_INTEGRATION=4bao5ug   # ANY /{proxy+}
ROOT_INTEGRATION=k3p1e6c    # ANY /
CLUSTER=resumeloop
PORT=3000
WAIT=90

if [[ "${1:-}" != "--no-wait" ]]; then
  echo "Waiting ${WAIT}s for ECS task to become healthy..."
  sleep "$WAIT"
fi

echo "Resolving ECS task public IP..."
TASK_ARN=$(aws ecs list-tasks --cluster "$CLUSTER" --query 'taskArns[0]' --output text)
ENI_ID=$(aws ecs describe-tasks --cluster "$CLUSTER" --tasks "$TASK_ARN" \
  --query 'tasks[0].attachments[0].details[?name==`networkInterfaceId`].value' \
  --output text)
PUBLIC_IP=$(aws ec2 describe-network-interfaces \
  --network-interface-ids "$ENI_ID" \
  --query 'NetworkInterfaces[0].Association.PublicIp' --output text)

echo "New IP: $PUBLIC_IP"

echo "Verifying direct health check..."
curl -sf "http://$PUBLIC_IP:$PORT/api/health" | python3 -m json.tool

echo "Updating API Gateway integrations..."
aws apigatewayv2 update-integration \
  --api-id "$API_ID" \
  --integration-id "$PROXY_INTEGRATION" \
  --integration-uri "http://$PUBLIC_IP:$PORT/{proxy}" \
  --query 'IntegrationUri' --output text

aws apigatewayv2 update-integration \
  --api-id "$API_ID" \
  --integration-id "$ROOT_INTEGRATION" \
  --integration-uri "http://$PUBLIC_IP:$PORT" \
  --query 'IntegrationUri' --output text

echo "Verifying API Gateway health check..."
curl -sf "https://$API_ID.execute-api.us-east-1.amazonaws.com/api/health" | python3 -m json.tool

echo "Done."

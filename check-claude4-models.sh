#!/bin/bash

echo "🔍 Claude 4モデル詳細調査スクリプト"
echo "====================================="
echo ""

# 1. 利用可能なClaude 4モデルを確認
echo "📋 Claude 4モデルの確認:"
aws bedrock list-foundation-models \
  --region ap-northeast-1 \
  --query "modelSummaries[?contains(modelId, 'claude') && contains(modelId, '4')].[modelId,modelName,modelLifecycle.status]" \
  --output table

echo ""
echo "📋 すべてのClaudeモデル（詳細）:"
aws bedrock list-foundation-models \
  --region ap-northeast-1 \
  --query "modelSummaries[?contains(modelId, 'claude')].{ID:modelId,Name:modelName,Status:modelLifecycle.status,Provider:providerName}" \
  --output json | jq '.'

# 2. 特定のモデルIDでアクセステスト
echo ""
echo "🧪 モデルアクセステスト:"

# Sonnet 4のバリエーションをテスト
MODEL_IDS=(
  "anthropic.claude-sonnet-4-20250514-v1:0"
  "apac.anthropic.claude-sonnet-4-20250514-v1:0"
  "anthropic.claude-4-sonnet-20250514-v1:0"
  "anthropic.claude-sonnet-4-v1:0"
)

for MODEL_ID in "${MODEL_IDS[@]}"; do
  echo ""
  echo "Testing: $MODEL_ID"
  
  aws bedrock-runtime invoke-model \
    --model-id "$MODEL_ID" \
    --body '{"anthropic_version":"bedrock-2023-05-31","max_tokens":100,"messages":[{"role":"user","content":"Hello"}]}' \
    --cli-binary-format raw-in-base64-out \
    --region ap-northeast-1 \
    test-output-$(echo $MODEL_ID | tr ':.' '_').json 2>&1
  
  if [ $? -eq 0 ]; then
    echo "✅ $MODEL_ID: アクセス可能"
  else
    echo "❌ $MODEL_ID: アクセス不可"
  fi
done

# 3. Lambda関数の現在の設定確認
echo ""
echo "📋 Lambda関数の環境変数:"
aws lambda get-function-configuration \
  --function-name vts-websocket-handler \
  --query "Environment.Variables" \
  --output json | jq '.'

# 4. 最新のエラーログ確認
echo ""
echo "🔍 最新のBedrockエラー（過去30分）:"
aws logs filter-log-events \
  --log-group-name /aws/lambda/vts-websocket-handler \
  --start-time $(($(date +%s) - 1800))000 \
  --filter-pattern '"ResourceNotFoundException" OR "ValidationException" OR "Model not found"' \
  --query "events[*].message" \
  --output text | head -10

echo ""
echo "🔍 AI処理関連の最新ログ:"
aws logs filter-log-events \
  --log-group-name /aws/lambda/vts-websocket-handler \
  --start-time $(($(date +%s) - 600))000 \
  --filter-pattern '"processVTSCommunication" OR "generateEmergencyResponse" OR "BedrockProcessor"' \
  --query "events[-5:].message" \
  --output text

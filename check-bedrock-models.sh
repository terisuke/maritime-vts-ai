#!/bin/bash

echo "🔍 Amazon Bedrock利用可能モデル調査"
echo "================================="
echo ""

# 1. 利用可能な全Claudeモデルを確認
echo "📋 利用可能なClaudeモデル一覧:"
aws bedrock list-foundation-models \
  --region ap-northeast-1 \
  --query "modelSummaries[?contains(modelId, 'claude')].[modelId,modelName]" \
  --output table

echo ""
echo "🔍 詳細情報（JSON形式）:"
aws bedrock list-foundation-models \
  --region ap-northeast-1 \
  --query "modelSummaries[?contains(modelId, 'claude')].{ID:modelId,Name:modelName,Provider:providerName,Status:modelLifecycle.status}" \
  --output json

# 2. 特定モデルのテスト
echo ""
echo "🧪 モデルアクセステスト:"

# Claude 3 Sonnetのテスト
echo "Testing: anthropic.claude-3-sonnet-20240229-v1:0"
aws bedrock-runtime invoke-model \
  --model-id "anthropic.claude-3-sonnet-20240229-v1:0" \
  --body '{"anthropic_version":"bedrock-2023-05-31","max_tokens":100,"messages":[{"role":"user","content":"テスト"}]}' \
  --cli-binary-format raw-in-base64-out \
  --region ap-northeast-1 \
  test-output-sonnet3.json 2>&1

if [ $? -eq 0 ]; then
  echo "✅ Claude 3 Sonnet: アクセス可能"
  cat test-output-sonnet3.json | jq -r '.content[0].text' 2>/dev/null || cat test-output-sonnet3.json
else
  echo "❌ Claude 3 Sonnet: アクセス不可"
fi

# Claude 3.5 Sonnetのテスト  
echo ""
echo "Testing: anthropic.claude-3-5-sonnet-20240620-v1:0"
aws bedrock-runtime invoke-model \
  --model-id "anthropic.claude-3-5-sonnet-20240620-v1:0" \
  --body '{"anthropic_version":"bedrock-2023-05-31","max_tokens":100,"messages":[{"role":"user","content":"テスト"}]}' \
  --cli-binary-format raw-in-base64-out \
  --region ap-northeast-1 \
  test-output-sonnet35.json 2>&1

if [ $? -eq 0 ]; then
  echo "✅ Claude 3.5 Sonnet: アクセス可能"
  cat test-output-sonnet35.json | jq -r '.content[0].text' 2>/dev/null || cat test-output-sonnet35.json
else
  echo "❌ Claude 3.5 Sonnet: アクセス不可"
fi

# 3. Lambda関数の環境変数確認
echo ""
echo "📋 Lambda関数の環境変数:"
aws lambda get-function-configuration \
  --function-name vts-websocket-handler \
  --query "Environment.Variables.BEDROCK_MODEL_ID" \
  --output text

echo ""
echo "調査完了"

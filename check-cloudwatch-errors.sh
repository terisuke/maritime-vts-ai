#!/bin/bash

echo "🔍 CloudWatch Logs エラー調査"
echo "================================="
echo ""

# 最新のエラーログを取得
echo "📋 最新のエラーログ (過去30分):"
aws logs filter-log-events \
  --log-group-name /aws/lambda/vts-websocket-handler \
  --start-time $(($(date +%s) - 1800))000 \
  --filter-pattern "ERROR" \
  --query "events[*].[timestamp,message]" \
  --output text | head -20

echo ""
echo "🔍 Bedrock関連のログ:"
aws logs filter-log-events \
  --log-group-name /aws/lambda/vts-websocket-handler \
  --start-time $(($(date +%s) - 1800))000 \
  --filter-pattern "Bedrock" \
  --query "events[*].message" \
  --output text | head -20

echo ""
echo "🔍 AI処理関連のログ:"
aws logs filter-log-events \
  --log-group-name /aws/lambda/vts-websocket-handler \
  --start-time $(($(date +%s) - 1800))000 \
  --filter-pattern '"AI processing" OR "aiResponse" OR "classification"' \
  --query "events[*].message" \
  --output text | head -20

echo ""
echo "📊 WebSocketメッセージフロー確認:"
aws logs filter-log-events \
  --log-group-name /aws/lambda/vts-websocket-handler \
  --start-time $(($(date +%s) - 300))000 \
  --filter-pattern '"action":"message" OR "transcription" OR "AI_RESPONSE"' \
  --query "events[*].message" \
  --output text | head -10

echo ""
echo "⚠️ 最新の例外:"
aws logs filter-log-events \
  --log-group-name /aws/lambda/vts-websocket-handler \
  --start-time $(($(date +%s) - 1800))000 \
  --filter-pattern "Exception OR Error OR Failed" \
  --query "events[-5:].message" \
  --output text
